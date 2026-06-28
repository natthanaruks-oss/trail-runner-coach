const MAX_BODY_BYTES = 2 * 1024 * 1024;
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
        response = json({ ok: true, service: 'trail-runner-coach-apple-health-shortcut', version: '1.1.1' });
      } else if (url.pathname === '/setup/status' && request.method === 'GET') {
        response = json({
          ok: true,
          service: 'trail-runner-coach-apple-health-shortcut',
          version: '1.1.1',
          ingestionModes: ['health_auto_export', 'shortcuts_bridge'],
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
  if (length > MAX_BODY_BYTES) throw httpError(413, 'payload_too_large', 'Payload ใหญ่เกิน 2 MB — เปิด Summarize Data หรือ Batch Requests ใน Health Auto Export');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw httpError(413, 'payload_too_large', 'Payload ใหญ่เกิน 2 MB — เปิด Summarize Data หรือ Batch Requests ใน Health Auto Export');
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
    },
    transport: incoming.transport || 'shortcuts_bridge',
    format: incoming.ingestionFormat || 'trail_runner_bridge_v1'
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
    transport: current.transport || 'shortcuts_bridge',
    schemaVersion: 1,
    ingestionFormat: current.ingestionFormat || null,
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
  if (isHealthAutoExportPayload(input)) return normalizeHealthAutoExport(input);

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
  return { exportedAt, dailyMetrics, bodyComposition, activities, transport: 'shortcuts_bridge', ingestionFormat: 'trail_runner_bridge_v1' };
}

function isHealthAutoExportPayload(input) {
  return Array.isArray(input?.data?.metrics) || Array.isArray(input?.metrics);
}

function normalizeHealthAutoExport(input) {
  const metrics = Array.isArray(input?.data?.metrics) ? input.data.metrics : input.metrics;
  const daily = new Map();
  const body = new Map();

  for (const metric of metrics) {
    const name = normalizeMetricName(metric?.name);
    const units = String(metric?.units || '').trim();
    const points = Array.isArray(metric?.data) ? metric.data : [];
    if (!name || !points.length) continue;

    if (name === 'sleep_analysis') {
      ingestSleep(points, daily);
      continue;
    }

    for (const point of points) {
      const date = healthDate(point?.date || point?.startDate || point?.endDate);
      if (!date) continue;
      const value = pointNumber(point);
      if (value === null) continue;

      if (isMetric(name, ['step_count', 'steps'])) {
        addDaily(daily, date, 'steps', value);
      } else if (isMetric(name, ['active_energy', 'active_energy_burned'])) {
        addDaily(daily, date, 'activeEnergyKcal', convertEnergy(value, units));
      } else if (isMetric(name, ['apple_exercise_time', 'exercise_time'])) {
        addDaily(daily, date, 'exerciseMinutes', convertDurationMinutes(value, units));
      } else if (isMetric(name, ['walking_running_distance', 'walking_and_running_distance'])) {
        addDaily(daily, date, 'walkingRunningDistanceKm', convertDistanceKm(value, units));
      } else if (isMetric(name, ['resting_heart_rate'])) {
        setLatestDaily(daily, date, 'restingHr', value, point?.date);
      } else if (isMetric(name, ['heart_rate_variability', 'heart_rate_variability_sdnn', 'hrv', 'hrv_sdnn'])) {
        setLatestDaily(daily, date, 'hrvMs', convertHrvMs(value, units), point?.date);
      } else if (isMetric(name, ['weight_and_body_mass', 'weight_body_mass', 'body_mass', 'weight'])) {
        setLatestBody(body, date, 'weightKg', convertWeightKg(value, units), point?.date);
      } else if (isMetric(name, ['body_fat_percentage', 'body_fat'])) {
        setLatestBody(body, date, 'percentBodyFat', convertPercent(value, units), point?.date);
      } else if (isMetric(name, ['lean_body_mass'])) {
        setLatestBody(body, date, 'leanBodyMassKg', convertWeightKg(value, units), point?.date);
      } else if (isMetric(name, ['height'])) {
        setLatestBody(body, date, 'heightCm', convertHeightCm(value, units), point?.date);
      }
    }
  }

  const dailyMetrics = [...daily.values()].map(row => normalizeDaily({
    ...row,
    sourceDevice: 'Health Auto Export',
    sourceBundle: 'com.healthyapps.healthautoexport'
  })).filter(Boolean);
  const bodyComposition = [...body.values()].map(row => normalizeBody({
    ...row,
    sourceDevice: 'Health Auto Export'
  })).filter(Boolean);

  if (!dailyMetrics.length && !bodyComposition.length) {
    throw httpError(400, 'no_supported_data', 'Health Auto Export ส่งมาแล้ว แต่ไม่พบ Metric ที่รองรับ — ตรวจรายการ Metric และเปิด Summarize Data');
  }

  return {
    exportedAt: validIso(input.exportedAt || input?.data?.exportedAt) || new Date().toISOString(),
    dailyMetrics,
    bodyComposition,
    activities: [],
    transport: 'health_auto_export',
    ingestionFormat: 'health_auto_export_json_v2'
  };
}

function ingestSleep(points, daily) {
  const aggregated = new Map();
  const segments = new Map();
  for (const point of points) {
    const date = healthDate(point?.date || point?.sleepEnd || point?.endDate || point?.startDate);
    if (!date) continue;
    const total = firstFinite(point?.totalSleep, point?.asleep);
    if (total !== null) aggregated.set(date, Math.max(aggregated.get(date) || 0, total));
    const state = String(point?.value || '').trim().toLowerCase();
    if (['core', 'deep', 'rem', 'asleep'].includes(state)) {
      const qty = Number(point?.qty);
      if (Number.isFinite(qty) && qty >= 0) segments.set(date, (segments.get(date) || 0) + qty);
    }
  }
  for (const date of new Set([...aggregated.keys(), ...segments.keys()])) {
    const hours = aggregated.get(date) || segments.get(date) || 0;
    if (hours > 0) setDaily(daily, date, 'sleepHours', hours);
  }
}

function normalizeMetricName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\+/g, ' ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function isMetric(name, aliases) {
  return aliases.includes(name);
}

function healthDate(value) {
  const text = normalizeCalendarYearText(value);
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return validDate(match[1]);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function pointNumber(point) {
  return firstFinite(point?.qty, point?.Avg, point?.avg, point?.value);
}

function firstFinite(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function ensureDaily(map, date) {
  if (!map.has(date)) map.set(date, { date, _latest: {} });
  return map.get(date);
}

function ensureBody(map, date) {
  if (!map.has(date)) map.set(date, { date, measuredAt: null, _latest: {} });
  return map.get(date);
}

function addDaily(map, date, key, value) {
  if (!Number.isFinite(value)) return;
  const row = ensureDaily(map, date);
  row[key] = (Number(row[key]) || 0) + value;
}

function setDaily(map, date, key, value) {
  if (!Number.isFinite(value)) return;
  ensureDaily(map, date)[key] = value;
}

function setLatestDaily(map, date, key, value, timestamp) {
  if (!Number.isFinite(value)) return;
  const row = ensureDaily(map, date);
  const rank = timestampRank(timestamp);
  if (rank >= (row._latest[key] || 0)) { row[key] = value; row._latest[key] = rank; }
}

function setLatestBody(map, date, key, value, timestamp) {
  if (!Number.isFinite(value)) return;
  const row = ensureBody(map, date);
  const rank = timestampRank(timestamp);
  if (rank >= (row._latest[key] || 0)) {
    row[key] = value;
    row._latest[key] = rank;
    const iso = healthIso(timestamp);
    if (iso) row.measuredAt = iso;
  }
}

function timestampRank(value) {
  const iso = healthIso(value);
  return iso ? new Date(iso).getTime() : 0;
}

function healthIso(value) {
  if (!value) return null;
  const text = String(value).trim();
  const normalized = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{4}/.test(text)
    ? text.replace(' ', 'T').replace(/ ([+-]\d{2})(\d{2})$/, '$1:$2')
    : text;
  return validIso(normalized);
}

function unitText(units) { return String(units || '').trim().toLowerCase(); }
function convertEnergy(value, units) {
  const unit = unitText(units);
  if (/kj|kilojoule/.test(unit)) return value / 4.184;
  return value;
}
function convertDurationMinutes(value, units) {
  const unit = unitText(units);
  if (/hour|\bhr\b|^h$/.test(unit)) return value * 60;
  if (/second|\bsec\b|^s$/.test(unit)) return value / 60;
  return value;
}
function convertDistanceKm(value, units) {
  const unit = unitText(units);
  if (/mile|\bmi\b/.test(unit)) return value * 1.609344;
  if (/meter|metre|^m$/.test(unit) && !/kilo/.test(unit)) return value / 1000;
  return value;
}
function convertWeightKg(value, units) {
  const unit = unitText(units);
  if (/pound|\blb\b/.test(unit)) return value * 0.45359237;
  if (/gram|^g$/.test(unit) && !/kilo/.test(unit)) return value / 1000;
  return value;
}
function convertHeightCm(value, units) {
  const unit = unitText(units);
  if (/inch|\bin\b/.test(unit)) return value * 2.54;
  if (/meter|metre|^m$/.test(unit) && !/centi/.test(unit)) return value * 100;
  return value;
}
function convertPercent(value, units) {
  const unit = unitText(units);
  if (unit.includes('%') || /percent/.test(unit)) return value;
  return value <= 1 ? value * 100 : value;
}
function convertHrvMs(value, units) {
  const unit = unitText(units);
  return /^s$|second/.test(unit) ? value * 1000 : value;
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
    transport: incoming.transport || current.transport || 'shortcuts_bridge',
    ingestionFormat: incoming.ingestionFormat || current.ingestionFormat || 'trail_runner_bridge_v1',
    dailyMetrics: mergeBy(current.dailyMetrics, incoming.dailyMetrics, row => row.date).slice(-MAX_DAILY_RECORDS),
    bodyComposition: mergeBy(current.bodyComposition, incoming.bodyComposition, row => `${row.date}:${row.measuredAt || row.id || ''}`).slice(-MAX_BODY_RECORDS),
    activities: mergeBy(current.activities, incoming.activities, row => row.externalId).slice(-MAX_ACTIVITY_RECORDS)
  };
}

function mergeBy(existing = [], incoming = [], keyFn) {
  const map = new Map(existing.map(row => [keyFn(row), row]));
  for (const row of incoming) {
    const clean = Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null && value !== undefined));
    map.set(keyFn(row), { ...(map.get(keyFn(row)) || {}), ...clean });
  }
  return [...map.values()].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
}

async function readProfile(env) {
  const encrypted = await env.APPLE_HEALTH_DATA.get('profile:default');
  if (!encrypted) return emptyProfile();
  try { return normalizeStoredProfile(await decryptJson(encrypted, env.APPLE_HEALTH_ENCRYPTION_KEY)); }
  catch { throw httpError(500, 'decrypt_failed', 'อ่านข้อมูล Apple Health ไม่สำเร็จ'); }
}

function emptyProfile() {
  return { schemaVersion: 1, updatedAt: null, transport: null, ingestionFormat: null, dailyMetrics: [], bodyComposition: [], activities: [] };
}

function normalizeStoredProfile(profile = {}) {
  return {
    schemaVersion: 1,
    updatedAt: validIso(profile.updatedAt) || null,
    transport: profile.transport || null,
    ingestionFormat: profile.ingestionFormat || null,
    dailyMetrics: mergeBy([], (profile.dailyMetrics || []).map(normalizeDaily).filter(Boolean), row => row.date).slice(-MAX_DAILY_RECORDS),
    bodyComposition: mergeBy([], (profile.bodyComposition || []).map(normalizeBody).filter(Boolean), row => `${row.date}:${row.measuredAt || row.id || ''}`).slice(-MAX_BODY_RECORDS),
    activities: mergeBy([], (profile.activities || []).map(normalizeActivity).filter(Boolean), row => row.externalId).slice(-MAX_ACTIVITY_RECORDS)
  };
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
function normalizeCalendarYearText(value) {
  const text = String(value || '').trim();
  return text.replace(/^(\d{4})(?=-\d{2}-\d{2})/, (_, yearText) => {
    const year = Number(yearText);
    return year >= 2400 && year <= 2999 ? String(year - 543).padStart(4, '0') : yearText;
  });
}
function validDate(value) {
  const text = normalizeCalendarYearText(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const date = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getUTCFullYear() !== Number(yearText) || date.getUTCMonth() + 1 !== Number(monthText) || date.getUTCDate() !== Number(dayText)) return null;
  return text;
}
function validIso(value) {
  if (!value) return null;
  const date = new Date(normalizeCalendarYearText(value));
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
