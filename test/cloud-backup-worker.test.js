import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/cloud-backup/src/index.js';

class MemoryKV {
  constructor() { this.values = new Map(); this.metadata = new Map(); }
  async get(key) { return this.values.get(key) ?? null; }
  async getWithMetadata(key) { return { value: this.values.get(key) ?? null, metadata: this.metadata.get(key) ?? null }; }
  async put(key, value, options = {}) { this.values.set(key, String(value)); this.metadata.set(key, options.metadata ?? null); }
  async delete(key) { this.values.delete(key); this.metadata.delete(key); }
  async list({ prefix = '', cursor } = {}) {
    const keys = [...this.values.keys()].filter(key => key.startsWith(prefix)).sort().map(name => ({ name, metadata: this.metadata.get(name) ?? null }));
    return { keys, list_complete: true, cursor: cursor || '' };
  }
}

const env = () => ({
  APP_ORIGIN: 'https://app.example.workers.dev',
  BACKUP_VAULTS: new MemoryKV(),
  BACKUP_BLOBS: new MemoryKV()
});
const vaultId = 'trc_abcdefghijklmnopqrstuvwx';
const token = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234';
const kdf = { name: 'PBKDF2', hash: 'SHA-256', iterations: 100000, salt: 'abcdefghijklmnopqrstuv' };
const envelope = {
  format: 'trail-runner-coach-encrypted-backup',
  formatVersion: 1,
  createdAt: '2026-06-25T00:00:00.000Z',
  appVersion: '2.0.0',
  schemaVersion: 4,
  compression: 'none',
  cipher: { name: 'AES-GCM', iv: 'abcdefghijklmnop', tagLength: 128, additionalData: 'YWJj' },
  kdf,
  plaintextSha256: 'abcdefghijklmnopqrstuv',
  plaintextBytes: 100,
  encryptedBytes: 120,
  recordCount: 5,
  ciphertext: 'abcdefghijklmnopqrstuvwxyz'
};

function request(path, { method = 'GET', body, auth = true } = {}) {
  return new Request(`https://backup.example.workers.dev${path}`, {
    method,
    headers: {
      origin: 'https://app.example.workers.dev',
      ...(auth ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
}

async function jsonResponse(response) { return { status: response.status, body: await response.json() }; }

test('cloud backup worker creates vault and manages encrypted versions', async () => {
  const bindings = env();
  let result = await jsonResponse(await worker.fetch(request('/v1/vaults', {
    method: 'POST', auth: false, body: { vaultId, accessToken: token, kdf, retention: 3 }
  }), bindings));
  assert.equal(result.status, 201);
  assert.equal(result.body.zeroKnowledge, true);

  result = await jsonResponse(await worker.fetch(request(`/v1/vaults/${vaultId}`, { auth: false }), bindings));
  assert.equal(result.status, 401);

  for (let index = 0; index < 4; index += 1) {
    const backup = { ...envelope, createdAt: `2026-06-25T00:0${index}:00.000Z`, recordCount: index + 1 };
    result = await jsonResponse(await worker.fetch(request(`/v1/vaults/${vaultId}/backups`, { method: 'POST', body: backup }), bindings));
    assert.equal(result.status, 201);
  }

  result = await jsonResponse(await worker.fetch(request(`/v1/vaults/${vaultId}/backups`), bindings));
  assert.equal(result.status, 200);
  assert.equal(result.body.backups.length, 3);
  assert.equal(result.body.backups[0].recordCount, 4);

  const versionId = result.body.backups[0].versionId;
  result = await jsonResponse(await worker.fetch(request(`/v1/vaults/${vaultId}/backups/${versionId}`), bindings));
  assert.equal(result.status, 200);
  assert.equal(result.body.backup.ciphertext, envelope.ciphertext);

  result = await jsonResponse(await worker.fetch(request(`/v1/vaults/${vaultId}/backups/${versionId}`, { method: 'DELETE' }), bindings));
  assert.equal(result.status, 200);

  result = await jsonResponse(await worker.fetch(request(`/v1/vaults/${vaultId}`, { method: 'DELETE' }), bindings));
  assert.equal(result.status, 200);
  assert.equal(result.body.deletedBackups, 2);
});
