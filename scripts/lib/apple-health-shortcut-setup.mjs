export const APPLE_HEALTH_SHORTCUT_REQUIRED_SECRETS = Object.freeze([
  'APPLE_HEALTH_BRIDGE_TOKEN',
  'APPLE_HEALTH_ENCRYPTION_KEY'
]);

export const APPLE_HEALTH_SHORTCUT_KV_BINDINGS = Object.freeze([
  { binding: 'APPLE_HEALTH_DATA', suffix: 'apple-health-data' }
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

export function buildWorkerConfig({ appOrigin, workerName, existingConfig = {} }) {
  const source = existingConfig && typeof existingConfig === 'object' ? existingConfig : {};
  const validKv = Array.isArray(source.kv_namespaces)
    ? source.kv_namespaces.filter(item => item?.binding && /^[0-9a-f]{32}$/i.test(String(item.id || '')))
    : [];
  const existingRequired = Array.isArray(source.secrets?.required) ? source.secrets.required : [];
  return {
    ...source,
    name: normalizeWorkerName(workerName),
    main: source.main || 'src/index.js',
    compatibility_date: '2026-06-25',
    vars: { ...(source.vars || {}), APP_ORIGIN: normalizeHttpsOrigin(appOrigin) },
    secrets: {
      ...(source.secrets || {}),
      required: [...new Set([...existingRequired, ...APPLE_HEALTH_SHORTCUT_REQUIRED_SECRETS])]
    },
    kv_namespaces: validKv
  };
}

export function buildSetupReceipt({ workerUrl, appOrigin, workerName, accessToken, shortcutName = 'TRC Apple Health Sync' }) {
  const origin = normalizeHttpsOrigin(workerUrl);
  const token = String(accessToken || '').trim();
  if (token.length < 32) throw new Error('Bridge token ไม่ถูกต้อง');
  return {
    schemaVersion: 1,
    provider: 'apple_health_shortcut',
    workerName: normalizeWorkerName(workerName),
    appOrigin: normalizeHttpsOrigin(appOrigin),
    workerUrl: origin,
    importUrl: `${origin}/v1/import`,
    syncUrl: `${origin}/v1/sync`,
    statusUrl: `${origin}/setup/status`,
    accessToken: token,
    shortcutName,
    createdAt: new Date().toISOString(),
    containsSecrets: true
  };
}

export function parseWranglerWorkerUrl(output) {
  const matches = String(output || '').match(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/gi) || [];
  return matches.at(-1) || '';
}
