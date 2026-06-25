const CLOUD_PROVIDERS = ['garmin', 'suunto', 'strava'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), env);
    try {
      if (url.pathname === '/health') return json({ ok: true, service: 'trail-runner-coach-wearable-sync', version: '1.8.0', providers: CLOUD_PROVIDERS }, 200, env);
      if (url.pathname === '/setup/status' && request.method === 'GET') return setupStatus(request, env);
      if (url.pathname.match(/^\/oauth\/(garmin|suunto|strava)\/start$/) && request.method === 'GET') return oauthStart(request, env);
      if (url.pathname.match(/^\/oauth\/(garmin|suunto|strava)\/callback$/) && request.method === 'GET') return oauthCallback(request, env);
      if (url.pathname === '/api/connections' && request.method === 'GET') return getConnections(request, env);
      if (url.pathname.match(/^\/api\/connections\/(garmin|suunto|strava)$/) && request.method === 'DELETE') return disconnect(request, env);
      if (url.pathname.match(/^\/api\/sync\/(garmin|suunto|strava)$/) && request.method === 'POST') return syncProvider(request, env);
      if (url.pathname === '/webhooks/strava') return stravaWebhook(request, env);
      if (url.pathname === '/webhooks/garmin' || url.pathname === '/webhooks/suunto') return json({ ok: true, accepted: true }, 202, env);
      return json({ ok: false, code: 'not_found' }, 404, env);
    } catch (error) {
      console.error(error);
      const headers = error.retryAfterSeconds ? { 'retry-after': String(error.retryAfterSeconds) } : {};
      return json({ ok: false, code: error.code || 'internal_error', message: error.message || 'Unexpected error' }, error.status || 500, env, headers);
    }
  }
};


function setupStatus(request, env) {
  const origin = new URL(request.url).origin;
  const strava = {
    clientId: Boolean(env.STRAVA_CLIENT_ID),
    clientSecret: Boolean(env.STRAVA_CLIENT_SECRET),
    encryptionKey: Boolean(env.TOKEN_ENCRYPTION_KEY),
    verifyToken: Boolean(env.STRAVA_VERIFY_TOKEN)
  };
  strava.ready = Object.values(strava).every(Boolean);
  const kv = {
    oauthState: Boolean(env.OAUTH_STATE),
    wearableTokens: Boolean(env.WEARABLE_TOKENS),
    wearableEvents: Boolean(env.WEARABLE_EVENTS)
  };
  const appOrigin = Boolean(env.APP_ORIGIN);
  return json({
    ok: true,
    service: 'trail-runner-coach-wearable-sync',
    version: '1.8.0',
    appOrigin,
    appOriginValue: appOrigin ? env.APP_ORIGIN : null,
    kv,
    providers: { strava },
    ready: appOrigin && strava.ready && Object.values(kv).every(Boolean),
    callbackUrl: `${origin}/oauth/strava/callback`,
    webhookUrl: `${origin}/webhooks/strava`
  }, 200, env);
}

async function oauthStart(request, env) {
  requireBindings(env, ['OAUTH_STATE', 'WEARABLE_TOKENS', 'TOKEN_ENCRYPTION_KEY', 'APP_ORIGIN']);
  const url = new URL(request.url);
  const provider = pathProvider(url.pathname);
  const deviceToken = url.searchParams.get('device_token');
  if (!deviceToken || deviceToken.length < 40) return json({ ok: false, message: 'Invalid device token' }, 400, env);
  const returnTo = safeReturnTo(url.searchParams.get('return_to'), env.APP_ORIGIN);
  const config = providerConfig(provider, env, url.origin);
  const state = randomHex(24);
  const deviceHash = await sha256(deviceToken);
  await env.OAUTH_STATE.put(`oauth:${state}`, JSON.stringify({ provider, deviceHash, returnTo, createdAt: Date.now() }), { expirationTtl: 600 });
  const authorize = new URL(config.authorizeUrl);
  authorize.searchParams.set('client_id', config.clientId);
  authorize.searchParams.set('redirect_uri', config.redirectUri);
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('state', state);
  if (config.scope) authorize.searchParams.set('scope', config.scope);
  if (provider === 'strava') authorize.searchParams.set('approval_prompt', 'auto');
  return Response.redirect(authorize.toString(), 302);
}

async function oauthCallback(request, env) {
  requireBindings(env, ['OAUTH_STATE', 'WEARABLE_TOKENS', 'TOKEN_ENCRYPTION_KEY', 'APP_ORIGIN']);
  const url = new URL(request.url);
  const provider = pathProvider(url.pathname);
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  const stored = state ? await env.OAUTH_STATE.get(`oauth:${state}`, 'json') : null;
  if (!stored || stored.provider !== provider) return redirectResult(env.APP_ORIGIN, provider, null, 'invalid_state');
  await env.OAUTH_STATE.delete(`oauth:${state}`);
  if (!code) return redirectResult(stored.returnTo, provider, null, url.searchParams.get('error') || 'missing_code');
  const config = providerConfig(provider, env, url.origin);
  const token = await exchangeCode(provider, config, code);
  const encrypted = await encryptJson(token, env.TOKEN_ENCRYPTION_KEY);
  await env.WEARABLE_TOKENS.put(`token:${provider}:${stored.deviceHash}`, encrypted);
  const providerUserId = providerIdentity(provider, token);
  if (providerUserId) await env.WEARABLE_TOKENS.put(`provider-user:${provider}:${providerUserId}`, stored.deviceHash);
  return redirectResult(stored.returnTo, provider, true, null);
}

async function getConnections(request, env) {
  const deviceHash = await authorizeDevice(request, env);
  const providers = {};
  for (const provider of CLOUD_PROVIDERS) {
    const token = await env.WEARABLE_TOKENS.get(`token:${provider}:${deviceHash}`);
    providers[provider] = { connected: Boolean(token) };
  }
  return json({ ok: true, providers }, 200, env);
}

async function disconnect(request, env) {
  const deviceHash = await authorizeDevice(request, env);
  const provider = pathProvider(new URL(request.url).pathname);
  await env.WEARABLE_TOKENS.delete(`token:${provider}:${deviceHash}`);
  return json({ ok: true, provider, connected: false }, 200, env);
}

async function syncProvider(request, env) {
  const deviceHash = await authorizeDevice(request, env);
  const url = new URL(request.url);
  const provider = pathProvider(url.pathname);
  const encrypted = await env.WEARABLE_TOKENS.get(`token:${provider}:${deviceHash}`);
  if (!encrypted) return json({ ok: false, code: 'not_connected', message: `${provider} ยังไม่เชื่อมต่อ` }, 409, env);
  let token = await decryptJson(encrypted, env.TOKEN_ENCRYPTION_KEY);
  token = await refreshTokenIfNeeded(provider, token, env, url.origin);
  await env.WEARABLE_TOKENS.put(`token:${provider}:${deviceHash}`, await encryptJson(token, env.TOKEN_ENCRYPTION_KEY));
  const days = Math.max(1, Math.min(365, Number(url.searchParams.get('days')) || 90));
  if (provider === 'strava') return json({ ok: true, provider, activities: await fetchStravaActivities(token, days) }, 200, env);
  return json({
    ok: false,
    code: 'provider_adapter_pending',
    message: `${provider} OAuth boundary พร้อมแล้ว แต่ endpoint ดึงข้อมูลต้องเปิดตามสิทธิ์ API ที่ provider อนุมัติให้บัญชีนี้`
  }, 501, env);
}

async function stravaWebhook(request, env) {
  const url = new URL(request.url);
  if (request.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token && token === env.STRAVA_VERIFY_TOKEN) return json({ 'hub.challenge': challenge }, 200, env);
    return json({ ok: false }, 403, env);
  }
  if (request.method === 'POST') {
    const event = await request.json().catch(() => ({}));
    if (env.WEARABLE_EVENTS) await env.WEARABLE_EVENTS.put(`strava:${Date.now()}:${randomHex(6)}`, JSON.stringify(event), { expirationTtl: 86400 * 7 });
    return json({ ok: true }, 200, env);
  }
  return json({ ok: false }, 405, env);
}

async function exchangeCode(provider, config, code) {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: config.redirectUri
  });
  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${provider} token exchange failed (${response.status}): ${payload.message || payload.error || 'unknown'}`);
  return { ...payload, obtained_at: Math.floor(Date.now() / 1000) };
}

async function refreshTokenIfNeeded(provider, token, env, origin) {
  const expiresAt = Number(token.expires_at || token.expiresAt || 0);
  if (!token.refresh_token || !expiresAt || expiresAt > Math.floor(Date.now() / 1000) + 300) return token;
  const config = providerConfig(provider, env, origin);
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: token.refresh_token,
    grant_type: 'refresh_token'
  });
  const response = await fetch(config.tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${provider} token refresh failed (${response.status})`);
  return { ...token, ...payload, obtained_at: Math.floor(Date.now() / 1000) };
}

async function fetchStravaActivities(token, days) {
  const after = Math.floor((Date.now() - days * 86400000) / 1000);
  const url = new URL('https://www.strava.com/api/v3/athlete/activities');
  url.searchParams.set('after', String(after));
  url.searchParams.set('per_page', '200');
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token.access_token}` } });
  const rows = await response.json().catch(() => []);
  if (!response.ok) {
    const error = new HttpError(response.status, `Strava activity sync failed (${response.status})`, response.status === 429 ? 'rate_limited' : 'provider_error');
    const retryAfter = Number(response.headers.get('retry-after'));
    if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfterSeconds = retryAfter;
    throw error;
  }
  return rows.map(activity => ({
    id: `activity-strava-${activity.id}`,
    externalId: `strava:${activity.id}`,
    date: String(activity.start_date_local || activity.start_date || '').slice(0, 10),
    startTime: activity.start_date || null,
    name: activity.name || activity.sport_type || activity.type || 'Strava activity',
    type: activity.sport_type || activity.type || 'Run',
    durationMin: Math.round(Number(activity.moving_time || activity.elapsed_time || 0) / 60),
    distanceKm: +(Number(activity.distance || 0) / 1000).toFixed(2),
    elevationGainM: Math.round(Number(activity.total_elevation_gain || 0)),
    elevationLossM: 0,
    avgHr: activity.average_heartrate == null ? null : Number(activity.average_heartrate),
    maxHr: activity.max_heartrate == null ? null : Number(activity.max_heartrate),
    rpe: activity.perceived_exertion == null ? null : Number(activity.perceived_exertion),
    activeEnergyKcal: activity.calories == null ? null : Number(activity.calories),
    terrain: /trail|hike/i.test(`${activity.sport_type} ${activity.name}`) ? 'trail' : 'road',
    isNight: false,
    source: 'strava',
    importedAt: new Date().toISOString()
  }));
}

function providerConfig(provider, env, origin) {
  const upper = provider.toUpperCase();
  const defaults = provider === 'strava' ? {
    authorizeUrl: 'https://www.strava.com/oauth/authorize',
    tokenUrl: 'https://www.strava.com/oauth/token',
    scope: 'read,activity:read_all'
  } : {};
  const config = {
    clientId: env[`${upper}_CLIENT_ID`],
    clientSecret: env[`${upper}_CLIENT_SECRET`],
    authorizeUrl: env[`${upper}_AUTHORIZE_URL`] || defaults.authorizeUrl,
    tokenUrl: env[`${upper}_TOKEN_URL`] || defaults.tokenUrl,
    scope: env[`${upper}_SCOPES`] || defaults.scope || '',
    redirectUri: `${origin}/oauth/${provider}/callback`
  };
  for (const [key, value] of Object.entries(config)) if (['clientId', 'clientSecret', 'authorizeUrl', 'tokenUrl'].includes(key) && !value) throw new Error(`${provider} ${key} is not configured`);
  return config;
}

async function authorizeDevice(request, env) {
  requireBindings(env, ['WEARABLE_TOKENS', 'TOKEN_ENCRYPTION_KEY']);
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token || token.length < 40) throw new HttpError(401, 'Missing device authorization');
  return sha256(token);
}
function pathProvider(pathname) { return pathname.split('/').find(part => CLOUD_PROVIDERS.includes(part)); }
function providerIdentity(provider, token) { if (provider === 'strava') return token.athlete?.id; return token.user_id || token.userId || token.account_id || null; }
function safeReturnTo(value, appOrigin) { try { const url = new URL(value || appOrigin); if (url.origin !== new URL(appOrigin).origin) return appOrigin; return url.toString(); } catch { return appOrigin; } }
function redirectResult(returnTo, provider, connected, error) { const target = new URL(returnTo || '/'); const separator = target.hash.includes('?') ? '&' : '?'; target.hash = `${target.hash || '#/connections'}${separator}provider=${encodeURIComponent(provider)}${connected ? '&connected=1' : ''}${error ? `&error=${encodeURIComponent(error)}` : ''}`; return Response.redirect(target.toString(), 302); }
function requireBindings(env, names) { for (const name of names) if (!env[name]) throw new Error(`Missing Worker binding/secret: ${name}`); }
function randomHex(bytes) { const data = new Uint8Array(bytes); crypto.getRandomValues(data); return [...data].map(value => value.toString(16).padStart(2, '0')).join(''); }
async function sha256(value) { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return bytesToHex(new Uint8Array(digest)); }
function bytesToHex(bytes) { return [...bytes].map(value => value.toString(16).padStart(2, '0')).join(''); }
function base64ToBytes(value) { const binary = atob(value); return Uint8Array.from(binary, char => char.charCodeAt(0)); }
function bytesToBase64(bytes) { let binary = ''; bytes.forEach(byte => { binary += String.fromCharCode(byte); }); return btoa(binary); }
async function encryptionKey(secret) { const raw = secret.length === 44 ? base64ToBytes(secret) : new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))); return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']); }
async function encryptJson(value, secret) { const iv = crypto.getRandomValues(new Uint8Array(12)); const key = await encryptionKey(secret); const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(value)))); return JSON.stringify({ iv: bytesToBase64(iv), data: bytesToBase64(encrypted) }); }
async function decryptJson(value, secret) { const parsed = JSON.parse(value); const key = await encryptionKey(secret); const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(parsed.iv) }, key, base64ToBytes(parsed.data)); return JSON.parse(new TextDecoder().decode(decrypted)); }
function cors(response, env) { const headers = new Headers(response.headers); headers.set('access-control-allow-origin', env.APP_ORIGIN || '*'); headers.set('access-control-allow-headers', 'authorization,content-type'); headers.set('access-control-allow-methods', 'GET,POST,DELETE,OPTIONS'); return new Response(response.body, { status: response.status, headers }); }
function json(body, status, env, extraHeaders = {}) {
  const response = Response.json(body, { status, headers: extraHeaders });
  return cors(response, env);
}
class HttpError extends Error {
  constructor(status, message, code = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = null;
  }
}
