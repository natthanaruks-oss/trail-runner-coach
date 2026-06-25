const MAX_BACKUP_BYTES = 12 * 1024 * 1024;
const DEFAULT_RETENTION = 10;
const MAX_RETENTION = 30;
const VAULT_PREFIX = 'vault:';
const BACKUP_PREFIX = 'backup:';

export default {
  async fetch(request, env) {
    try {
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), env);
      const url = new URL(request.url);
      assertOriginAllowed(request, env);
      if (url.pathname === '/health') return json({ ok: true, service: 'trail-runner-coach-cloud-backup', encryption: 'client-side', storage: bindingsReady(env) }, 200, env);
      if (url.pathname === '/v1/vaults' && request.method === 'POST') return await createVault(request, env);

      const match = url.pathname.match(/^\/v1\/vaults\/([^/]+)(?:\/backups(?:\/([^/]+))?)?$/);
      if (!match) return json({ ok: false, code: 'not_found', message: 'Not found' }, 404, env);
      const vaultId = decodeURIComponent(match[1]);
      const versionId = match[2] ? decodeURIComponent(match[2]) : null;
      const hasBackupsPath = url.pathname.includes('/backups');

      if (!hasBackupsPath && request.method === 'GET') return await vaultStatus(request, env, vaultId);
      if (!hasBackupsPath && request.method === 'PATCH') return await updateVault(request, env, vaultId);
      if (!hasBackupsPath && request.method === 'DELETE') return await deleteVault(request, env, vaultId);
      if (hasBackupsPath && !versionId && request.method === 'POST') return await createBackup(request, env, vaultId);
      if (hasBackupsPath && !versionId && request.method === 'GET') return await listBackups(request, env, vaultId);
      if (hasBackupsPath && versionId && request.method === 'GET') return await getBackup(request, env, vaultId, versionId);
      if (hasBackupsPath && versionId && request.method === 'DELETE') return await deleteBackup(request, env, vaultId, versionId);
      return json({ ok: false, code: 'method_not_allowed', message: 'Method not allowed' }, 405, env);
    } catch (error) {
      const status = Number(error.status) || 500;
      if (status >= 500) console.error(error);
      return json({ ok: false, code: error.code || 'server_error', message: status >= 500 ? 'Cloud backup service error' : error.message }, status, env);
    }
  }
};

async function createVault(request, env) {
  requireBindings(env);
  const body = await readJsonBody(request, 64 * 1024);
  const vaultId = validateVaultId(body.vaultId);
  const accessToken = validateAccessToken(body.accessToken);
  const kdf = validateKdf(body.kdf);
  const retention = clampRetention(body.retention);
  const key = vaultMetaKey(vaultId);
  if (await env.BACKUP_VAULTS.get(key)) throw new HttpError(409, 'Vault already exists', 'vault_exists');
  const now = new Date().toISOString();
  const metadata = {
    vaultId,
    tokenHash: await sha256Hex(accessToken),
    kdf,
    retention,
    createdAt: now,
    updatedAt: now,
    latestBackupAt: null,
    backupCount: 0
  };
  await env.BACKUP_VAULTS.put(key, JSON.stringify(metadata));
  return json(publicVault(metadata), 201, env);
}

async function vaultStatus(request, env, vaultId) {
  const metadata = await authorizeVault(request, env, vaultId);
  return json({ ok: true, ...publicVault(metadata) }, 200, env);
}


async function updateVault(request, env, vaultId) {
  let metadata = await authorizeVault(request, env, vaultId);
  const body = await readJsonBody(request, 16 * 1024);
  const retention = clampRetention(body.retention ?? metadata.retention);
  metadata = { ...metadata, retention, updatedAt: new Date().toISOString() };
  const pruned = await pruneBackups(env, vaultId, retention);
  if (pruned > 0) metadata.backupCount = Math.max(0, Number(metadata.backupCount || 0) - pruned);
  await env.BACKUP_VAULTS.put(vaultMetaKey(vaultId), JSON.stringify(metadata));
  return json({ ok: true, ...publicVault(metadata), pruned }, 200, env);
}

async function createBackup(request, env, vaultId) {
  let metadata = await authorizeVault(request, env, vaultId);
  const envelope = await readJsonBody(request, MAX_BACKUP_BYTES);
  validateEnvelope(envelope);
  const serialized = JSON.stringify(envelope);
  const byteLength = new TextEncoder().encode(serialized).byteLength;
  if (byteLength > MAX_BACKUP_BYTES) throw new HttpError(413, 'Encrypted backup is too large', 'backup_too_large');
  const createdAt = normalizeIso(envelope.createdAt) || new Date().toISOString();
  const versionId = `${createdAt.replace(/[-:.TZ]/g, '').slice(0, 14)}-${randomHex(5)}`;
  const key = backupKey(vaultId, versionId);
  const itemMetadata = {
    versionId,
    createdAt,
    appVersion: envelope.appVersion || null,
    schemaVersion: envelope.schemaVersion ?? null,
    recordCount: Number(envelope.recordCount) || 0,
    encryptedBytes: Number(envelope.encryptedBytes) || byteLength,
    plaintextBytes: Number(envelope.plaintextBytes) || 0,
    formatVersion: Number(envelope.formatVersion) || 1
  };
  await env.BACKUP_BLOBS.put(key, serialized, { metadata: itemMetadata });
  metadata = {
    ...metadata,
    updatedAt: new Date().toISOString(),
    latestBackupAt: createdAt,
    backupCount: Number(metadata.backupCount || 0) + 1
  };
  await env.BACKUP_VAULTS.put(vaultMetaKey(vaultId), JSON.stringify(metadata));
  const pruned = await pruneBackups(env, vaultId, metadata.retention);
  if (pruned > 0) {
    metadata.backupCount = Math.max(0, metadata.backupCount - pruned);
    await env.BACKUP_VAULTS.put(vaultMetaKey(vaultId), JSON.stringify(metadata));
  }
  return json({ ok: true, versionId, createdAt, recordCount: itemMetadata.recordCount, encryptedBytes: itemMetadata.encryptedBytes, pruned }, 201, env);
}

async function listBackups(request, env, vaultId) {
  const metadata = await authorizeVault(request, env, vaultId);
  const rows = await listAllBackupKeys(env, vaultId);
  const backups = rows.map(row => ({
    versionId: row.metadata?.versionId || row.name.split(':').at(-1),
    createdAt: row.metadata?.createdAt || null,
    appVersion: row.metadata?.appVersion || null,
    schemaVersion: row.metadata?.schemaVersion ?? null,
    recordCount: Number(row.metadata?.recordCount) || 0,
    encryptedBytes: Number(row.metadata?.encryptedBytes) || 0,
    plaintextBytes: Number(row.metadata?.plaintextBytes) || 0
  })).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return json({ ok: true, vaultId, retention: metadata.retention, backups }, 200, env);
}

async function getBackup(request, env, vaultId, versionId) {
  await authorizeVault(request, env, vaultId);
  validateVersionId(versionId);
  const result = await env.BACKUP_BLOBS.getWithMetadata(backupKey(vaultId, versionId));
  if (!result?.value) throw new HttpError(404, 'Backup version not found', 'backup_not_found');
  let backup;
  try { backup = JSON.parse(result.value); }
  catch { throw new HttpError(500, 'Stored backup is corrupt', 'backup_corrupt'); }
  return json({ ok: true, metadata: result.metadata || {}, backup }, 200, env);
}

async function deleteBackup(request, env, vaultId, versionId) {
  let metadata = await authorizeVault(request, env, vaultId);
  validateVersionId(versionId);
  const key = backupKey(vaultId, versionId);
  const exists = await env.BACKUP_BLOBS.get(key);
  if (!exists) throw new HttpError(404, 'Backup version not found', 'backup_not_found');
  await env.BACKUP_BLOBS.delete(key);
  metadata = { ...metadata, backupCount: Math.max(0, Number(metadata.backupCount || 0) - 1), updatedAt: new Date().toISOString() };
  await env.BACKUP_VAULTS.put(vaultMetaKey(vaultId), JSON.stringify(metadata));
  return json({ ok: true, deleted: versionId }, 200, env);
}

async function deleteVault(request, env, vaultId) {
  await authorizeVault(request, env, vaultId);
  const rows = await listAllBackupKeys(env, vaultId);
  await Promise.all(rows.map(row => env.BACKUP_BLOBS.delete(row.name)));
  await env.BACKUP_VAULTS.delete(vaultMetaKey(vaultId));
  return json({ ok: true, deletedVault: vaultId, deletedBackups: rows.length }, 200, env);
}

async function authorizeVault(request, env, vaultId) {
  requireBindings(env);
  validateVaultId(vaultId);
  const raw = await env.BACKUP_VAULTS.get(vaultMetaKey(vaultId));
  if (!raw) throw new HttpError(404, 'Vault not found', 'vault_not_found');
  let metadata;
  try { metadata = JSON.parse(raw); }
  catch { throw new HttpError(500, 'Vault metadata is corrupt', 'vault_corrupt'); }
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Missing vault authorization', 'unauthorized');
  const suppliedHash = await sha256Hex(token);
  if (!constantTimeEqual(suppliedHash, metadata.tokenHash)) throw new HttpError(403, 'Invalid vault authorization', 'forbidden');
  return metadata;
}

async function pruneBackups(env, vaultId, retention) {
  const rows = await listAllBackupKeys(env, vaultId);
  const sorted = [...rows].sort((a, b) => String(b.metadata?.createdAt || b.name).localeCompare(String(a.metadata?.createdAt || a.name)));
  const remove = sorted.slice(clampRetention(retention));
  await Promise.all(remove.map(row => env.BACKUP_BLOBS.delete(row.name)));
  return remove.length;
}

async function listAllBackupKeys(env, vaultId) {
  const prefix = backupPrefix(vaultId);
  let cursor;
  const rows = [];
  do {
    const page = await env.BACKUP_BLOBS.list({ prefix, cursor, limit: 1000 });
    rows.push(...page.keys);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return rows;
}

function validateEnvelope(value) {
  if (!value || typeof value !== 'object') throw new HttpError(400, 'Encrypted backup payload is invalid', 'invalid_backup');
  if (value.format !== 'trail-runner-coach-encrypted-backup' || Number(value.formatVersion) !== 1) throw new HttpError(400, 'Unsupported backup format', 'unsupported_backup');
  if (value.cipher?.name !== 'AES-GCM' || !value.cipher?.iv || !value.ciphertext || !value.plaintextSha256) throw new HttpError(400, 'Encrypted backup fields are incomplete', 'invalid_backup');
  validateKdf(value.kdf);
}

function validateKdf(value) {
  const iterations = Number(value?.iterations);
  const salt = String(value?.salt || '');
  if ((value?.name || 'PBKDF2') !== 'PBKDF2' || (value?.hash || 'SHA-256') !== 'SHA-256') throw new HttpError(400, 'Unsupported KDF', 'invalid_kdf');
  if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 1000000 || salt.length < 20) throw new HttpError(400, 'KDF parameters are invalid', 'invalid_kdf');
  return { name: 'PBKDF2', hash: 'SHA-256', iterations, salt };
}

function validateVaultId(value) {
  const id = String(value || '');
  if (!/^trc_[A-Za-z0-9_-]{20,80}$/.test(id)) throw new HttpError(400, 'Vault ID is invalid', 'invalid_vault_id');
  return id;
}
function validateAccessToken(value) { const token = String(value || ''); if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) throw new HttpError(400, 'Access token is invalid', 'invalid_access_token'); return token; }
function validateVersionId(value) { if (!/^[A-Za-z0-9_-]{8,80}$/.test(String(value || ''))) throw new HttpError(400, 'Version ID is invalid', 'invalid_version_id'); }
function clampRetention(value) { return Math.max(3, Math.min(MAX_RETENTION, Math.round(Number(value) || DEFAULT_RETENTION))); }
function normalizeIso(value) { const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toISOString() : null; }
function vaultMetaKey(vaultId) { return `${VAULT_PREFIX}${vaultId}:meta`; }
function backupPrefix(vaultId) { return `${BACKUP_PREFIX}${vaultId}:`; }
function backupKey(vaultId, versionId) { return `${backupPrefix(vaultId)}${versionId}`; }
function publicVault(metadata) { return { ok: true, vaultId: metadata.vaultId, kdf: metadata.kdf, retention: metadata.retention, createdAt: metadata.createdAt, updatedAt: metadata.updatedAt, latestBackupAt: metadata.latestBackupAt, backupCount: Number(metadata.backupCount) || 0, zeroKnowledge: true }; }
function bindingsReady(env) { return Boolean(env.BACKUP_VAULTS && env.BACKUP_BLOBS); }
function requireBindings(env) { if (!bindingsReady(env)) throw new Error('Missing BACKUP_VAULTS or BACKUP_BLOBS KV binding'); }

async function readJsonBody(request, maxBytes) {
  const length = Number(request.headers.get('content-length')) || 0;
  if (length > maxBytes) throw new HttpError(413, 'Request body is too large', 'payload_too_large');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new HttpError(413, 'Request body is too large', 'payload_too_large');
  try { return JSON.parse(text); }
  catch { throw new HttpError(400, 'Request body must be valid JSON', 'invalid_json'); }
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function constantTimeEqual(a, b) { const left = String(a || ''); const right = String(b || ''); if (left.length !== right.length) return false; let diff = 0; for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index); return diff === 0; }
function randomHex(bytes) { const data = crypto.getRandomValues(new Uint8Array(bytes)); return [...data].map(value => value.toString(16).padStart(2, '0')).join(''); }
function assertOriginAllowed(request, env) {
  const origin = request.headers.get('origin');
  if (!origin || !env.APP_ORIGIN) return;
  if (origin !== env.APP_ORIGIN) throw new HttpError(403, 'Origin is not allowed', 'origin_forbidden');
}
function cors(response, env) { const headers = new Headers(response.headers); headers.set('access-control-allow-origin', env.APP_ORIGIN || '*'); headers.set('access-control-allow-headers', 'authorization,content-type'); headers.set('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS'); headers.set('cache-control', 'no-store'); headers.set('x-content-type-options', 'nosniff'); return new Response(response.body, { status: response.status, headers }); }
function json(body, status, env) { return cors(Response.json(body, { status }), env); }
class HttpError extends Error { constructor(status, message, code) { super(message); this.status = status; this.code = code; } }
