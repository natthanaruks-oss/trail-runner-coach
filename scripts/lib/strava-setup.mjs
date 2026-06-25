export const STRAVA_REQUIRED_SECRETS = Object.freeze([
  'TOKEN_ENCRYPTION_KEY',
  'STRAVA_CLIENT_ID',
  'STRAVA_CLIENT_SECRET',
  'STRAVA_VERIFY_TOKEN'
]);

export const STRAVA_KV_BINDINGS = Object.freeze([
  { binding: 'OAUTH_STATE', suffix: 'oauth-state' },
  { binding: 'WEARABLE_TOKENS', suffix: 'wearable-tokens' },
  { binding: 'WEARABLE_EVENTS', suffix: 'wearable-events' }
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

export function normalizeClientId(value) {
  const clientId = String(value || '').trim();
  if (!/^\d+$/.test(clientId)) throw new Error('Strava Client ID ต้องเป็นตัวเลข');
  return clientId;
}

export function buildWorkerConfig({ appOrigin, workerName, existingConfig = {}, existingKv = null }) {
  const source = existingConfig && typeof existingConfig === 'object' ? existingConfig : {};
  const kvSource = existingKv ?? source.kv_namespaces ?? [];
  const validKv = Array.isArray(kvSource)
    ? kvSource.filter(item => item?.binding && /^[0-9a-f]{32}$/i.test(String(item.id || '')))
    : [];
  const existingRequired = Array.isArray(source.secrets?.required) ? source.secrets.required : [];
  return {
    ...source,
    name: normalizeWorkerName(workerName),
    main: source.main || 'src/index.js',
    compatibility_date: '2026-06-25',
    vars: {
      ...(source.vars || {}),
      APP_ORIGIN: normalizeHttpsOrigin(appOrigin),
      STRAVA_SCOPES: 'read,activity:read_all'
    },
    secrets: {
      ...(source.secrets || {}),
      required: [...new Set([...existingRequired, ...STRAVA_REQUIRED_SECRETS])]
    },
    kv_namespaces: validKv
  };
}

export function setupUrls(workerUrl) {
  const origin = normalizeHttpsOrigin(workerUrl);
  const url = new URL(origin);
  return {
    workerUrl: origin,
    callbackDomain: url.host,
    callbackUrl: `${origin}/oauth/strava/callback`,
    webhookUrl: `${origin}/webhooks/strava`,
    healthUrl: `${origin}/health`,
    setupStatusUrl: `${origin}/setup/status`
  };
}

export function buildSetupReceipt({ workerUrl, appOrigin, workerName }) {
  const urls = setupUrls(workerUrl);
  return {
    schemaVersion: 1,
    provider: 'strava',
    workerName: normalizeWorkerName(workerName),
    appOrigin: normalizeHttpsOrigin(appOrigin),
    ...urls,
    createdAt: new Date().toISOString(),
    containsSecrets: false
  };
}

export function parseWranglerWorkerUrl(output) {
  const matches = String(output || '').match(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/gi) || [];
  return matches.at(-1) || '';
}
