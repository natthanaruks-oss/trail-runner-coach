export const CLOUD_BACKUP_KV_BINDINGS = Object.freeze([
  { binding: 'BACKUP_VAULTS', suffix: 'backup-vaults' },
  { binding: 'BACKUP_BLOBS', suffix: 'backup-blobs' }
]);

export function normalizeHttpsOrigin(value) {
  const input = String(value || '').trim().replace(/\/$/, '');
  let url;
  try { url = new URL(input); } catch { throw new Error('Web App URL ไม่ถูกต้อง'); }
  if (url.protocol !== 'https:') throw new Error('Web App URL ต้องใช้ https://');
  if (url.pathname !== '/' || url.search || url.hash) throw new Error('ใส่เฉพาะ origin เช่น https://example.workers.dev');
  return url.origin;
}

export function normalizeWorkerName(value) {
  const name = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(name)) {
    throw new Error('Worker name ใช้ได้เฉพาะ a-z, 0-9 และขีดกลาง ความยาวไม่เกิน 63 ตัวอักษร');
  }
  return name;
}

export function buildCloudBackupWorkerConfig({ appOrigin, workerName, existingConfig = {}, existingKv = null }) {
  const source = existingConfig && typeof existingConfig === 'object' ? existingConfig : {};
  const kvSource = existingKv ?? source.kv_namespaces ?? [];
  const validKv = Array.isArray(kvSource)
    ? kvSource.filter(item => item?.binding && /^[0-9a-f]{32}$/i.test(String(item.id || '')))
    : [];
  return {
    ...source,
    name: normalizeWorkerName(workerName),
    main: source.main || 'src/index.js',
    compatibility_date: '2026-06-25',
    vars: {
      ...(source.vars || {}),
      APP_ORIGIN: normalizeHttpsOrigin(appOrigin)
    },
    kv_namespaces: validKv
  };
}

export function parseWranglerWorkerUrl(output) {
  const matches = String(output || '').match(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/gi) || [];
  return matches.at(-1) || '';
}

export function buildCloudBackupSetupReceipt({ workerUrl, appOrigin, workerName }) {
  const origin = normalizeHttpsOrigin(workerUrl);
  return {
    format: 'trail-runner-coach-cloud-backup-setup',
    version: 1,
    workerName: normalizeWorkerName(workerName),
    workerUrl: origin,
    healthUrl: `${origin}/health`,
    appOrigin: normalizeHttpsOrigin(appOrigin),
    createdAt: new Date().toISOString(),
    containsSecrets: false
  };
}
