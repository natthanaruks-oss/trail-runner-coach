const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const BACKUP_FORMAT = 'trail-runner-coach-encrypted-backup';
export const BACKUP_FORMAT_VERSION = 1;
export const DEFAULT_PBKDF2_ITERATIONS = 310000;

export function randomBase64Url(byteLength = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return bytesToBase64Url(bytes);
}

export function generateVaultCredentials({ iterations = DEFAULT_PBKDF2_ITERATIONS } = {}) {
  return {
    vaultId: `trc_${randomBase64Url(18)}`,
    accessToken: randomBase64Url(32),
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations,
      salt: randomBase64Url(16)
    }
  };
}

export async function deriveBackupKeyMaterial(passphrase, kdf) {
  const normalized = validatePassphrase(passphrase);
  const params = normalizeKdf(kdf);
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(normalized),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    hash: params.hash,
    salt: base64UrlToBytes(params.salt),
    iterations: params.iterations
  }, baseKey, 256);
  return bytesToBase64Url(new Uint8Array(bits));
}

export async function importBackupKey(keyMaterial) {
  const bytes = base64UrlToBytes(String(keyMaterial || ''));
  if (bytes.byteLength !== 32) throw new Error('Encryption key ไม่ถูกต้อง');
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptSnapshot(snapshot, { passphrase = '', keyMaterial = '', kdf, createdAt = new Date().toISOString() } = {}) {
  validateSnapshot(snapshot);
  const params = normalizeKdf(kdf);
  const material = keyMaterial || await deriveBackupKeyMaterial(passphrase, params);
  const key = await importBackupKey(material);
  const plainBytes = encoder.encode(JSON.stringify(snapshot));
  const plaintextSha256 = await sha256Base64Url(plainBytes);
  const compressed = await compressBytes(plainBytes);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const additionalData = encoder.encode(`${BACKUP_FORMAT}:${BACKUP_FORMAT_VERSION}`);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({
    name: 'AES-GCM',
    iv,
    additionalData,
    tagLength: 128
  }, key, compressed.bytes));

  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt,
    appVersion: snapshot.appVersion || null,
    schemaVersion: snapshot.schemaVersion ?? null,
    compression: compressed.algorithm,
    cipher: {
      name: 'AES-GCM',
      iv: bytesToBase64Url(iv),
      tagLength: 128,
      additionalData: bytesToBase64Url(additionalData)
    },
    kdf: params,
    plaintextSha256,
    plaintextBytes: plainBytes.byteLength,
    encryptedBytes: ciphertext.byteLength,
    recordCount: countSnapshotRecords(snapshot),
    ciphertext: bytesToBase64Url(ciphertext)
  };
}

export async function decryptSnapshot(envelope, { passphrase = '', keyMaterial = '' } = {}) {
  validateEncryptedEnvelope(envelope);
  const material = keyMaterial || await deriveBackupKeyMaterial(passphrase, envelope.kdf);
  const key = await importBackupKey(material);
  const iv = base64UrlToBytes(envelope.cipher.iv);
  const additionalData = envelope.cipher.additionalData
    ? base64UrlToBytes(envelope.cipher.additionalData)
    : encoder.encode(`${BACKUP_FORMAT}:${BACKUP_FORMAT_VERSION}`);
  let decrypted;
  try {
    decrypted = new Uint8Array(await crypto.subtle.decrypt({
      name: 'AES-GCM',
      iv,
      additionalData,
      tagLength: Number(envelope.cipher.tagLength) || 128
    }, key, base64UrlToBytes(envelope.ciphertext)));
  } catch {
    throw new Error('ถอดรหัสไม่สำเร็จ: Passphrase หรือ Encryption Key ไม่ถูกต้อง');
  }
  const plainBytes = await decompressBytes(decrypted, envelope.compression);
  const digest = await sha256Base64Url(plainBytes);
  if (digest !== envelope.plaintextSha256) throw new Error('Backup checksum ไม่ตรง ข้อมูลอาจเสียหาย');
  let snapshot;
  try { snapshot = JSON.parse(decoder.decode(plainBytes)); }
  catch { throw new Error('ข้อมูล Backup หลังถอดรหัสไม่ใช่ JSON ที่ถูกต้อง'); }
  validateSnapshot(snapshot);
  return snapshot;
}

export function validateEncryptedEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object') throw new Error('Encrypted backup ไม่ถูกต้อง');
  if (envelope.format !== BACKUP_FORMAT || Number(envelope.formatVersion) !== BACKUP_FORMAT_VERSION) {
    throw new Error('รูปแบบ Encrypted backup ไม่รองรับ');
  }
  normalizeKdf(envelope.kdf);
  if (envelope.cipher?.name !== 'AES-GCM' || !envelope.cipher?.iv || !envelope.ciphertext) {
    throw new Error('Cipher metadata ไม่ครบ');
  }
  if (!envelope.plaintextSha256) throw new Error('Backup checksum หายไป');
  return true;
}

export function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || !snapshot.stores || typeof snapshot.stores !== 'object') {
    throw new Error('Snapshot ไม่ถูกต้อง');
  }
  return true;
}

export function countSnapshotRecords(snapshot) {
  return Object.values(snapshot?.stores || {}).reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0);
}

export function buildRecoveryKit({ baseUrl, vaultId, accessToken, kdf, createdAt = new Date().toISOString() }) {
  const url = normalizeHttpsOrigin(baseUrl);
  if (!/^trc_[A-Za-z0-9_-]{20,}$/.test(String(vaultId || ''))) throw new Error('Vault ID ไม่ถูกต้อง');
  if (String(accessToken || '').length < 40) throw new Error('Access Token ไม่ถูกต้อง');
  return {
    format: 'trail-runner-coach-cloud-backup-recovery-kit',
    version: 1,
    baseUrl: url,
    vaultId,
    accessToken,
    kdf: normalizeKdf(kdf),
    createdAt,
    warning: 'Keep this file private. It grants access to encrypted backup blobs. The passphrase is still required to decrypt them.'
  };
}

export function parseRecoveryKit(value) {
  const kit = typeof value === 'string' ? JSON.parse(value) : value;
  if (!kit || kit.format !== 'trail-runner-coach-cloud-backup-recovery-kit' || Number(kit.version) !== 1) {
    throw new Error('Recovery Kit ไม่ถูกต้อง');
  }
  return buildRecoveryKit(kit);
}

export function normalizeKdf(kdf) {
  const iterations = Number(kdf?.iterations);
  const salt = String(kdf?.salt || '');
  if ((kdf?.name || 'PBKDF2') !== 'PBKDF2' || (kdf?.hash || 'SHA-256') !== 'SHA-256') {
    throw new Error('รองรับเฉพาะ PBKDF2-SHA-256');
  }
  if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 1000000) throw new Error('PBKDF2 iterations ไม่ถูกต้อง');
  if (base64UrlToBytes(salt).byteLength < 16) throw new Error('KDF salt ไม่ถูกต้อง');
  return { name: 'PBKDF2', hash: 'SHA-256', iterations, salt };
}

export function normalizeHttpsOrigin(value) {
  let url;
  try { url = new URL(String(value || '').trim().replace(/\/$/, '')); }
  catch { throw new Error('Cloud Backup Worker URL ไม่ถูกต้อง'); }
  if (url.protocol !== 'https:') throw new Error('Cloud Backup Worker URL ต้องใช้ https://');
  if (url.pathname !== '/' || url.search || url.hash) throw new Error('ใส่เฉพาะ Worker origin เช่น https://name.account.workers.dev');
  return url.origin;
}

function validatePassphrase(passphrase) {
  const value = String(passphrase || '');
  if (value.length < 12) throw new Error('Passphrase ต้องมีอย่างน้อย 12 ตัวอักษร');
  return value.normalize('NFKC');
}

async function compressBytes(bytes) {
  if (typeof CompressionStream !== 'function') return { algorithm: 'none', bytes };
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
    return { algorithm: 'gzip', bytes: new Uint8Array(await new Response(stream).arrayBuffer()) };
  } catch {
    return { algorithm: 'none', bytes };
  }
}

async function decompressBytes(bytes, algorithm) {
  if (!algorithm || algorithm === 'none') return bytes;
  if (algorithm !== 'gzip' || typeof DecompressionStream !== 'function') throw new Error('Browser นี้ไม่รองรับการคลาย gzip backup');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function sha256Base64Url(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return bytesToBase64Url(new Uint8Array(digest));
}

export function bytesToBase64Url(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlToBytes(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  let binary;
  try { binary = atob(padded); }
  catch { throw new Error('Base64URL ไม่ถูกต้อง'); }
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
