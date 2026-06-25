const DEVICE_TOKEN_KEY = 'trail_runner_coach_device_token';

export const PROVIDER_DEFINITIONS = Object.freeze({
  apple_health: {
    label: 'Apple Health',
    type: 'native',
    data: 'Sleep, RHR, HRV, Steps, Active Energy, Workout และ Body metrics'
  },
  garmin: {
    label: 'Garmin',
    type: 'cloud',
    data: 'Health API + Activity API ผ่าน Garmin Connect Developer Program'
  },
  suunto: {
    label: 'Suunto',
    type: 'cloud',
    data: 'Workout/FIT, HR, RR, altitude, GPS ผ่าน Suunto Cloud API'
  },
  strava: {
    label: 'Strava',
    type: 'cloud',
    data: 'Activities, distance, elevation, HR และ webhook updates'
  }
});

export function normalizeSyncBaseUrl(value) {
  const input = String(value || '').trim().replace(/\/$/, '');
  if (!input) return '';
  let url;
  try { url = new URL(input); } catch { throw new Error('Worker URL ไม่ถูกต้อง'); }
  if (url.protocol !== 'https:') throw new Error('Worker URL ต้องใช้ https://');
  return url.origin;
}

export function getSyncBaseUrl(settings) {
  const value = String(settings?.integrations?.syncBaseUrl || '').trim();
  return value ? normalizeSyncBaseUrl(value) : '';
}

export function getStravaSetupDetails(value) {
  const workerUrl = normalizeSyncBaseUrl(value);
  if (!workerUrl) return null;
  const url = new URL(workerUrl);
  return {
    workerUrl,
    callbackDomain: url.host,
    callbackUrl: `${workerUrl}/oauth/strava/callback`,
    webhookUrl: `${workerUrl}/webhooks/strava`
  };
}

export function parseStravaSetupReceipt(value) {
  const receipt = typeof value === 'string' ? JSON.parse(value) : value;
  if (!receipt || receipt.provider !== 'strava' || Number(receipt.schemaVersion) !== 1) {
    throw new Error('ไฟล์ Strava setup ไม่ถูกต้อง');
  }
  const details = getStravaSetupDetails(receipt.workerUrl);
  return { ...receipt, ...details };
}

export function getDeviceToken() {
  let value = localStorage.getItem(DEVICE_TOKEN_KEY);
  if (value) return value;
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  value = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  localStorage.setItem(DEVICE_TOKEN_KEY, value);
  return value;
}

export async function fetchProviderSetupStatus(settings) {
  const baseUrl = getSyncBaseUrl(settings);
  if (!baseUrl) throw new Error('ยังไม่ได้ตั้งค่า Wearable Sync Worker URL');
  const response = await fetch(`${baseUrl}/setup/status`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || `ตรวจ Strava setup ไม่สำเร็จ (${response.status})`);
  return payload;
}

export async function fetchProviderConnections(settings) {
  const baseUrl = getSyncBaseUrl(settings);
  if (!baseUrl) return { configured: false, providers: {} };
  const response = await fetch(`${baseUrl}/api/connections`, {
    headers: { Authorization: `Bearer ${getDeviceToken()}` }
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw createProviderError(payload.message || `อ่านสถานะการเชื่อมต่อไม่สำเร็จ (${response.status})`, response, payload);
  }
  return { configured: true, ...(await response.json()) };
}

export function startProviderOAuth(provider, settings) {
  if (!['garmin', 'suunto', 'strava'].includes(provider)) throw new Error('Provider ไม่รองรับ');
  const baseUrl = getSyncBaseUrl(settings);
  if (!baseUrl) throw new Error('กรุณาตั้งค่า Wearable Sync Worker URL ก่อน');
  const returnTo = `${location.origin}/#/connections`;
  const url = new URL(`${baseUrl}/oauth/${provider}/start`);
  url.searchParams.set('device_token', getDeviceToken());
  url.searchParams.set('return_to', returnTo);
  location.assign(url.toString());
}

export async function disconnectProvider(provider, settings) {
  const baseUrl = getSyncBaseUrl(settings);
  if (!baseUrl) throw new Error('ยังไม่ได้ตั้งค่า Wearable Sync Worker URL');
  const response = await fetch(`${baseUrl}/api/connections/${provider}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${getDeviceToken()}` }
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw createProviderError(payload.message || `ยกเลิกการเชื่อมต่อไม่สำเร็จ (${response.status})`, response, payload);
  }
  return response.json();
}

export async function syncProviderActivities(provider, settings, days = 90) {
  const baseUrl = getSyncBaseUrl(settings);
  if (!baseUrl) throw new Error('ยังไม่ได้ตั้งค่า Wearable Sync Worker URL');
  const response = await fetch(`${baseUrl}/api/sync/${provider}?days=${Math.max(1, Math.min(365, Number(days) || 90))}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getDeviceToken()}` }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw createProviderError(payload.message || `Sync ${provider} ไม่สำเร็จ (${response.status})`, response, payload);
  return payload;
}

function createProviderError(message, response, payload = {}) {
  const error = new Error(message);
  error.status = Number(response?.status || 0);
  error.code = payload?.code || null;
  const retryAfter = response?.headers?.get?.('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    const dateMs = Date.parse(retryAfter);
    error.retryAfterMs = Number.isFinite(seconds) ? seconds * 1000 : (Number.isFinite(dateMs) ? Math.max(0, dateMs - Date.now()) : null);
  }
  return error;
}
