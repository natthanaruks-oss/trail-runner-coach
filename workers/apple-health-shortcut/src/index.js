const MAX_BODY_BYTES = 256 * 1024;
const MAX_DAILY_RECORDS = 400;
const MAX_BODY_RECORDS = 500;
const MAX_ACTIVITY_RECORDS = 1000;

export default {
  async fetch(request, env) {
    try {
      if (request.method === 'OPTIONS') return corsResponse(new Response(null, { status: 204 }), request, env);
      const url = new URL(request.url);
      let response;
      if (url.pathname === '/' || url.pathname === '/health') {
        response = json({ ok: true, service: 'trail-runner-coach-apple-health-shortcut', version: '1.0.0' });
      } else if (url.pathname === '/setup/status' && request.method === 'GET') {
        response = json({
          ok: true,
          service: 'trail-runner-coach-apple-health-shortcut',
          version: '1.0.0',
          appOrigin: Boolean(env.APP_ORIGIN),
          kv: Boolean(env.APPLE_HEALTH_DATA),
          bridgeToken: Boolean(env.APPLE_HEALTH_BRIDGE_TOKEN),
          encryptionKey: Boolean(env.APPLE_HEALTH_ENCRYPTION_KEY),
          ready: Boolean(env.APP_ORIGIN && env.APPLE_HEALTH_DATA && env.APPLE_HEALTH_BRIDGE_TOKEN && env.APPLE_HEALTH_ENCRYPTION_KEY)
        });
      } else if (url.pathname === '/v1/import' && request.method === 'POST') {
        response = await importPayload(request, env);
      } else if (url.pathname === '/v1/sync' && request.method === 'GET') {
        response = await syncPayload(request, env);
      } else if (url.pathname === '/v1/data' && request.method === 'DELETE') {
        response = await clearPayload(request, env);
      } else {
        response = json({ ok: false, code: 'not_found' }, 404);
      }
      return corsResponse(response, request, env);
    } catch (error) {
      const status = Number(error?.status || 500);
      const response = json({ ok: false, code: error?.code || 'internal_error', message: status >= 500 ? 'Apple Health bridge error' : error.message }, status);
      return corsResponse(response, request, env);
    }
  }
};

async function importPayload(request, env) {
  requireBindings(env);
  authorize(request, env);
  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_BODY_BYTES) throw httpError(413, 'payload_too_large', 'Payload ใหญ่เกิน 256 KB');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw httpError(413, 'payload_too_large', 'Payload ใหญ่เกิน 256 KB');
  let input;
  try { input = JSON.parse(text || '{}'); } catch { throw httpError(400, 'invalid_json', 'JSON ไม่ถูกต้อง'); }
  const incoming = normalizeIncoming(input);
  const current = await readProfile(env);
  const merged = mergeProfile(current, incoming);
  await writeProfile(env, merged);
  return json({
    ok: true,
    storedAt: merged.updatedAt,
    counts: {
      dailyMetrics: incoming.dailyMetrics.length,
      bodyComposition: incoming.bodyComposition.length,
      activities: incoming.activities.length
    }
  }, 201);
}

async function syncPayload(request, env) {
  requireBindings(env);
  authorize(request, env);
  const url = new URL(request.url);
  const days = Math.max(1, Math.min(365, Number(url.searchParams.get('days')) || 90));
  const cutoff = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
  const current = await readProfile(env);
  const dailyMetrics = current.dailyMetrics.filter(row => row.date >= cutoff);
  const bodyComposition = current.bodyComposition.filter(row => row.date >= cutoff);
  const activities = current.activities.filter(row => row.date >= cutoff);
  return json({
    ok: true,
    source: 'apple_health',
    transport: 'shortcuts_bridge',
    schemaVersion: 1,
    exportedAt: current.updatedAt || new Date().toISOString(),
    range: { days, startDate: cutoff, endDate: new Date().toISOString().slice(0, 10) },
    dailyMetrics,
    bodyComposition,
    activities
  });
}

async function clearPayload(request, env) {
  requireBindings(env);
  authorize(request, env);
  await env.APPLE_HEALTH_DATA.delete('profile:default');
  return json({ ok: true, deleted: true });
}

function normalizeIncoming(input) {
  const exportedAt = validIso(input.exportedAt) || new Date().toISOString();
  const dailyInput = Array.isArray(input.dailyMetrics)
    ? input.dailyMetrics
    : input.dailyMetric ? [input.dailyMetric]
      : input.date ? [input] : [];
  const bodyInput = Array.isArray(input.bodyComposition)
    ? input.bodyComposition
    : input.bodyComposition && typeof input.bodyComposition === 'object' ? [input.bodyComposition]
      : [];
  const activitiesInput = Array.isArray(input.activities) ? input.activities : [];
  const dailyMetrics = dailyInput.map(normalizeDaily).filter(Boolean);
  const bodyComposition = bodyInput.map(normalizeBody).filter(Boolean);
  const activities = activitiesInput.map(normalizeActivity).filter(Boolean);
  if (!dailyMetrics.length && !bodyComposition.length && !activities.length) {
    throw httpError(400, 'no_supported_data', 'ไม่พบข้อมูล Apple Health ที่รองรับ');
  }
  return { exportedAt, dailyMetrics, bodyComposition, activities };
}

function normalizeDaily(row) {
  const date = validDate(row?.date);
  if (!date) return null;
  return {
    date,
    sleepHours: bounded(row.sleepHours, 0, 24),
    restingHr: bounded(row.restingHr, 20, 240),
    hrvMs: bounded(row.hrvMs, 0, 1000),
    activeEnergyKcal: bounded(row.activeEnergyKcal, 0, 20000),
    steps: bounded(row.steps, 0, 200000),
    exerciseMinutes: bounded(row.exerciseMinutes, 0, 1440),
    walkingRunningDistanceKm: bounded(row.walkingRunningDistanceKm, 0, 500),
    sourceDevice: cleanText(row.sourceDevice || 'Apple Shortcuts', 100),
    sourceBundle: cleanText(row.sourceBundle || 'com.apple.shortcuts', 150)
  };
}

function normalizeBody(row) {
  const date = validDate(row?.date);
  if (!date) return null;
  return {
    id: cleanText(row.id || `shortcut-body-${date}`, 160),
    date,
    measuredAt: validIso(row.measuredAt) || null,
    weightKg: bounded(row.weightKg, 20, 400),
    percentBodyFat: bounded(row.percentBodyFat, 0, 80),
    leanBodyMassKg: bounded(row.leanBodyMassKg, 10, 300),
    heightCm: bounded(row.heightCm, 50, 260),
    sourceDevice: cleanText(row.sourceDevice || 'Apple Shortcuts', 100)
  };
}

function normalizeActivity(row) {
  const date = validDate(row?.date);
  const externalId = cleanText(row?.externalId || row?.uuid || row?.id, 180);
  if (!date || !externalId) return null;
  return {
    externalId,
    uuid: cleanText(row.uuid, 180) || null,
    date,
    startTime: validIso(row.startTime) || null,
    endTime: validIso(row.endTime) || null,
    name: cleanText(row.name || row.type || 'Apple Health Workout', 160),
    type: cleanText(row.type || 'Workout', 80),
    durationMin: bounded(row.durationMin, 0, 3000) || 0,
    distanceKm: bounded(row.distanceKm, 0, 500) || 0,
    elevationGainM: bounded(row.elevationGainM, 0, 20000) || 0,
    elevationLossM: bounded(row.elevationLossM, 0, 20000) || 0,
    avgHr: bounded(row.avgHr, 20, 240),
    maxHr: bounded(row.maxHr, 20, 260),
    activeEnergyKcal: bounded(row.activeEnergyKcal, 0, 20000),
    sourceDevice: cleanText(row.sourceDevice || 'Apple Shortcuts', 100)
  };
}

function mergeProfile(current, incoming) {
  return {
    schemaVersion: 1,
    updatedAt: incoming.exportedAt,
    dailyMetrics: mergeBy(current.dailyMetrics, incoming.dailyMetrics, row => row.date).slice(-MAX_DAILY_RECORDS),
    bodyComposition: mergeBy(current.bodyComposition, incoming.bodyComposition, row => `${row.date}:${row.measuredAt || row.id || ''}`).slice(-MAX_BODY_RECORDS),
    activities: mergeBy(current.activities, incoming.activities, row => row.externalId).slice(-MAX_ACTIVITY_RECORDS)
  };
}

function mergeBy(existing = [], incoming = [], keyFn) {
  const map = new Map(existing.map(row => [keyFn(row), row]));
  for (const row of incoming) map.set(keyFn(row), { ...(map.get(keyFn(row)) || {}), ...row });
  return [...map.values()].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
}

async function readProfile(env) {
  const encrypted = await env.APPLE_HEALTH_DATA.get('profile:default');
  if (!encrypted) return { schemaVersion: 1, updatedAt: null, dailyMetrics: [], bodyComposition: [], activities: [] };
  try { return await decryptJson(encrypted, env.APPLE_HEALTH_ENCRYPTION_KEY); }
  catch { throw httpError(500, 'decrypt_failed', 'อ่านข้อมูล Apple Health ไม่สำเร็จ'); }
}

async function writeProfile(env, value) {
  await env.APPLE_HEALTH_DATA.put('profile:default', await encryptJson(value, env.APPLE_HEALTH_ENCRYPTION_KEY));
}

function requireBindings(env) {
  if (!env.APPLE_HEALTH_DATA || !env.APPLE_HEALTH_BRIDGE_TOKEN || !env.APPLE_HEALTH_ENCRYPTION_KEY) {
    throw httpError(503, 'setup_incomplete', 'Apple Health Shortcut Worker ยังตั้งค่าไม่ครบ');
  }
}

function authorize(request, env) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token || !safeEqual(token, String(env.APPLE_HEALTH_BRIDGE_TOKEN))) throw httpError(401, 'unauthorized', 'Bridge token ไม่ถูกต้อง');
}

function safeEqual(a, b) {
  const left = new TextEncoder().encode(String(a));
  const right = new TextEncoder().encode(String(b));
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left[index] ^ right[index];
  return diff === 0;
}

async function encryptJson(value, keyText) {
  const key = await importAesKey(keyText);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
  return JSON.stringify({ v: 1, iv: toBase64(iv), data: toBase64(ciphertext) });
}

async function decryptJson(value, keyText) {
  const envelope = JSON.parse(value);
  const key = await importAesKey(keyText);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(envelope.iv) }, key, fromBase64(envelope.data));
  return JSON.parse(new TextDecoder().decode(plaintext));
}

async function importAesKey(keyText) {
  const raw = fromBase64(String(keyText || ''));
  if (raw.byteLength !== 32) throw new Error('Invalid encryption key');
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function toBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function fromBase64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function bounded(value, min, max) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return null;
  return number;
}
function validDate(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : text;
}
function validIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
function cleanText(value, max) {
  return String(value || '').trim().slice(0, max);
}
function httpError(status, code, message) {
  const error = new Error(message); error.status = status; error.code = code; return error;
}
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
function corsResponse(response, request, env) {
  const headers = new Headers(response.headers);
  const origin = request.headers.get('origin');
  if (origin && env.APP_ORIGIN && origin === env.APP_ORIGIN) headers.set('access-control-allow-origin', origin);
  headers.set('access-control-allow-headers', 'authorization,content-type');
  headers.set('access-control-allow-methods', 'GET,POST,DELETE,OPTIONS');
  headers.set('vary', 'Origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
