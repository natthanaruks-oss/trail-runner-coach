import { normalizeHttpsOrigin, normalizeWorkerName, parseWranglerWorkerUrl, STRAVA_KV_BINDINGS } from './strava-setup.mjs';

export const GOOGLE_HEALTH_REQUIRED_SECRETS = Object.freeze([
  'TOKEN_ENCRYPTION_KEY',
  'GOOGLE_HEALTH_CLIENT_ID',
  'GOOGLE_HEALTH_CLIENT_SECRET'
]);

export const GOOGLE_HEALTH_SCOPES = Object.freeze([
  'openid', 'email', 'profile',
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly'
]);

export const GOOGLE_HEALTH_KV_BINDINGS = STRAVA_KV_BINDINGS;

export function normalizeGoogleClientId(value) {
  const id = String(value || '').trim();
  if (id.length < 20 || !/\.apps\.googleusercontent\.com$/.test(id)) throw new Error('Google OAuth Client ID ไม่ถูกต้อง');
  return id;
}

export function buildGoogleHealthWorkerConfig({ appOrigin, workerName, existingConfig = {}, existingKv = null }) {
  const source = existingConfig && typeof existingConfig === 'object' ? existingConfig : {};
  const kvSource = existingKv ?? source.kv_namespaces ?? [];
  const validKv = Array.isArray(kvSource) ? kvSource.filter(item => item?.binding && /^[0-9a-f]{32}$/i.test(String(item.id || ''))) : [];
  const existingRequired = Array.isArray(source.secrets?.required) ? source.secrets.required : [];
  return {
    ...source,
    name: normalizeWorkerName(workerName),
    main: source.main || 'src/index.js',
    compatibility_date: '2026-06-25',
    vars: {
      ...(source.vars || {}),
      APP_ORIGIN: normalizeHttpsOrigin(appOrigin),
      GOOGLE_HEALTH_SCOPES: GOOGLE_HEALTH_SCOPES.join(' ')
    },
    secrets: {
      ...(source.secrets || {}),
      required: [...new Set([...existingRequired, ...GOOGLE_HEALTH_REQUIRED_SECRETS])]
    },
    kv_namespaces: validKv
  };
}

export function googleHealthSetupUrls(workerUrl) {
  const origin = normalizeHttpsOrigin(workerUrl);
  return {
    workerUrl: origin,
    callbackUrl: `${origin}/oauth/google_health/callback`,
    healthUrl: `${origin}/health`,
    setupStatusUrl: `${origin}/setup/status`
  };
}

export function buildGoogleHealthSetupReceipt({ workerUrl, appOrigin, workerName }) {
  return {
    schemaVersion: 1,
    provider: 'google_health',
    workerName: normalizeWorkerName(workerName),
    appOrigin: normalizeHttpsOrigin(appOrigin),
    ...googleHealthSetupUrls(workerUrl),
    createdAt: new Date().toISOString(),
    containsSecrets: false
  };
}

export { parseWranglerWorkerUrl };
