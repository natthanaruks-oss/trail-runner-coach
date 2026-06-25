import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRecoveryKit,
  decryptSnapshot,
  deriveBackupKeyMaterial,
  encryptSnapshot,
  generateVaultCredentials,
  parseRecoveryKit
} from '../public/js/core/cloud-backup-crypto.js';

const snapshot = {
  app: 'Trail Runner Coach',
  appVersion: '2.0.0',
  schemaVersion: 4,
  exportedAt: '2026-06-25T00:00:00.000Z',
  stores: {
    activities: [{ id: 'a1', distanceKm: 10 }],
    checkins: [{ date: '2026-06-25', sleepHours: 8 }],
    foodLogs: []
  }
};

test('vault credentials are high entropy and recovery kit round-trips safely', () => {
  const credentials = generateVaultCredentials();
  assert.match(credentials.vaultId, /^trc_[A-Za-z0-9_-]{20,}$/);
  assert.ok(credentials.accessToken.length >= 40);
  assert.equal(credentials.kdf.name, 'PBKDF2');
  const kit = buildRecoveryKit({ baseUrl: 'https://backup.example.workers.dev', ...credentials });
  assert.deepEqual(parseRecoveryKit(JSON.stringify(kit)), kit);
  assert.equal('passphrase' in kit, false);
});

test('snapshot encrypts and decrypts with passphrase', async () => {
  const credentials = generateVaultCredentials({ iterations: 100000 });
  const envelope = await encryptSnapshot(snapshot, {
    passphrase: 'correct horse battery staple',
    kdf: credentials.kdf
  });
  assert.equal(envelope.format, 'trail-runner-coach-encrypted-backup');
  assert.equal(envelope.recordCount, 2);
  assert.ok(envelope.ciphertext.length > 30);
  const restored = await decryptSnapshot(envelope, { passphrase: 'correct horse battery staple' });
  assert.deepEqual(restored, snapshot);
});

test('remembered key material decrypts without persisting the passphrase', async () => {
  const credentials = generateVaultCredentials({ iterations: 100000 });
  const keyMaterial = await deriveBackupKeyMaterial('remember this secure phrase', credentials.kdf);
  const envelope = await encryptSnapshot(snapshot, { keyMaterial, kdf: credentials.kdf });
  const restored = await decryptSnapshot(envelope, { keyMaterial });
  assert.deepEqual(restored, snapshot);
});

test('wrong passphrase cannot decrypt backup', async () => {
  const credentials = generateVaultCredentials({ iterations: 100000 });
  const envelope = await encryptSnapshot(snapshot, { passphrase: 'one secure passphrase', kdf: credentials.kdf });
  await assert.rejects(
    decryptSnapshot(envelope, { passphrase: 'different secure phrase' }),
    /ถอดรหัสไม่สำเร็จ/
  );
});
