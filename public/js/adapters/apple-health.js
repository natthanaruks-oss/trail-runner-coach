import { STORES } from '../core/constants.js';
import { nowIso } from '../core/date.js';
import { importActivitiesWithDedup } from './activity-import.js';

const BRIDGE_HANDLER = 'trailRunnerHealthKit';
const DEFAULT_TIMEOUT_MS = 120000;
const SHORTCUT_PROVIDER = 'apple_health_shortcut';

export function isAppleHealthBridgeAvailable() {
  return Boolean(globalThis.window?.webkit?.messageHandlers?.[BRIDGE_HANDLER]?.postMessage);
}

export function getAppleHealthShortcutConfig(settings) {
  const value = settings?.integrations?.appleHealthShortcut || {};
  return {
    baseUrl: normalizeShortcutBaseUrl(value.baseUrl || ''),
    accessToken: String(value.accessToken || '').trim(),
    shortcutName: String(value.shortcutName || 'TRC Apple Health Sync').trim() || 'TRC Apple Health Sync',
    configuredAt: value.configuredAt || null
  };
}

export function isAppleHealthShortcutConfigured(settings) {
  const config = getAppleHealthShortcutConfig(settings);
  return Boolean(config.baseUrl && config.accessToken.length >= 32);
}

export function isAppleHealthAvailable(settings) {
  return isAppleHealthBridgeAvailable() || isAppleHealthShortcutConfigured(settings);
}

export function appleHealthConnectionMode(settings) {
  if (isAppleHealthBridgeAvailable()) return 'native';
  if (isAppleHealthShortcutConfigured(settings)) return 'shortcut';
  return 'none';
}

export function requestAppleHealthAuthorization() {
  return postBridgeRequest('authorize', {});
}

export function requestAppleHealthSync({ days = 90, includeRoutes = false } = {}) {
  return postBridgeRequest('sync', { days, includeRoutes });
}

export async function requestAppleHealthPayload(settings, { days = 90, includeRoutes = false } = {}) {
  if (isAppleHealthBridgeAvailable()) return requestAppleHealthSync({ days, includeRoutes });
  if (isAppleHealthShortcutConfigured(settings)) return fetchAppleHealthShortcutPayload(settings, { days });
  const error = new Error('Apple Health ยังไม่ได้เชื่อมต่อ: ตั้งค่า Shortcuts Bridge หรือเปิดผ่าน iOS Companion');
  error.code = 'not_connected';
  error.status = 409;
  throw error;
}

export async function fetchAppleHealthShortcutStatus(settings) {
  const config = getAppleHealthShortcutConfig(settings);
  if (!config.baseUrl) throw new Error('ยังไม่ได้ตั้งค่า Apple Health Shortcut Worker URL');
  const response = await fetch(`${config.baseUrl}/setup/status`, { cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw createShortcutError(payload.message || `ตรวจ Worker ไม่สำเร็จ (${response.status})`, response, payload);
  return payload;
}

export async function fetchAppleHealthShortcutPayload(settings, { days = 90 } = {}) {
  const config = getAppleHealthShortcutConfig(settings);
  if (!config.baseUrl || config.accessToken.length < 32) throw new Error('Apple Health Shortcuts Bridge ยังตั้งค่าไม่ครบ');
  const response = await fetch(`${config.baseUrl}/v1/sync?days=${Math.max(1, Math.min(365, Number(days) || 90))}`, {
    headers: { Authorization: `Bearer ${config.accessToken}` },
    cache: 'no-store'
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw createShortcutError(payload.message || `Sync Apple Health ไม่สำเร็จ (${response.status})`, response, payload);
  return payload;
}

export async function clearAppleHealthShortcutData(settings) {
  const config = getAppleHealthShortcutConfig(settings);
  if (!config.baseUrl || config.accessToken.length < 32) throw new Error('Apple Health Shortcuts Bridge ยังตั้งค่าไม่ครบ');
  const response = await fetch(`${config.baseUrl}/v1/data`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${config.accessToken}` }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw createShortcutError(payload.message || `ลบข้อมูลไม่สำเร็จ (${response.status})`, response, payload);
  return payload;
}

export function parseAppleHealthShortcutSetupReceipt(value) {
  const receipt = typeof value === 'string' ? JSON.parse(value) : value;
  if (!receipt || receipt.provider !== SHORTCUT_PROVIDER || Number(receipt.schemaVersion) !== 1) {
    throw new Error('ไฟล์ Apple Health Shortcut setup ไม่ถูกต้อง');
  }
  const baseUrl = normalizeShortcutBaseUrl(receipt.workerUrl || receipt.baseUrl);
  const accessToken = String(receipt.accessToken || '').trim();
  if (!baseUrl || accessToken.length < 32) throw new Error('ไฟล์ Setup ไม่มี Worker URL หรือ Bridge Token ที่ถูกต้อง');
  return {
    baseUrl,
    accessToken,
    shortcutName: String(receipt.shortcutName || 'TRC Apple Health Sync').trim() || 'TRC Apple Health Sync',
    configuredAt: new Date().toISOString()
  };
}

export function normalizeShortcutBaseUrl(value) {
  const input = String(value || '').trim().replace(/\/$/, '');
  if (!input) return '';
  let url;
  try { url = new URL(input); } catch { throw new Error('Apple Health Worker URL ไม่ถูกต้อง'); }
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash) throw new Error('ใส่เฉพาะ Worker origin ที่ขึ้นต้นด้วย https://');
  return url.origin;
}

export function buildAppleShortcutRunUrl(settings) {
  const name = getAppleHealthShortcutConfig(settings).shortcutName;
  return `shortcuts://run-shortcut?name=${encodeURIComponent(name)}`;
}

function postBridgeRequest(action, payload) {
  if (!isAppleHealthBridgeAvailable()) {
    return Promise.reject(new Error('Apple Health ใช้ได้เมื่อเปิดเว็บผ่าน Trail Runner Coach iOS Companion เท่านั้น'));
  }
  installReceiver();
  const requestId = globalThis.crypto?.randomUUID?.() || `ah-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error('Apple Health sync ใช้เวลานานเกินกำหนด'));
    }, DEFAULT_TIMEOUT_MS);
    pending.set(requestId, { resolve, reject, timer });
    globalThis.window.webkit.messageHandlers[BRIDGE_HANDLER].postMessage({ action, requestId, ...payload });
  });
}

const pending = new Map();

export function installReceiver() {
  if (!globalThis.window) return;
  const existing = globalThis.window.TrailRunnerCoachHealth || {};
  globalThis.window.TrailRunnerCoachHealth = {
    ...existing,
    receive(payload) {
      settle(payload?.requestId, 'resolve', payload);
      globalThis.window.dispatchEvent(new CustomEvent('trail-runner-coach:apple-health-payload', { detail: payload }));
    },
    fail(payload) {
      const error = new Error(payload?.message || 'Apple Health sync failed');
      settle(payload?.requestId, 'reject', error);
      globalThis.window.dispatchEvent(new CustomEvent('trail-runner-coach:apple-health-error', { detail: payload }));
    },
    status(payload) {
      globalThis.window.dispatchEvent(new CustomEvent('trail-runner-coach:apple-health-status', { detail: payload }));
    }
  };
}

function settle(requestId, method, value) {
  if (!requestId || !pending.has(requestId)) return;
  const entry = pending.get(requestId);
  clearTimeout(entry.timer);
  pending.delete(requestId);
  entry[method](value);
}

export function normalizeAppleHealthPayload(payload, settings = {}) {
  if (!payload || payload.source !== 'apple_health') throw new Error('Apple Health payload ไม่ถูกต้อง');
  const exportedAt = payload.exportedAt || nowIso();
  const maxHrReference = Number(settings?.athlete?.maxHr) || null;

  const checkins = (payload.dailyMetrics || []).map(metric => ({
    date: metric.date,
    source: 'apple_health',
    sources: ['apple_health'],
    sleepHours: numberOrNull(metric.sleepHours),
    sleepQuality: null,
    restingHr: numberOrNull(metric.restingHr),
    hrvMs: numberOrNull(metric.hrvMs),
    activeEnergyKcal: numberOrNull(metric.activeEnergyKcal),
    steps: numberOrNull(metric.steps),
    exerciseMinutes: numberOrNull(metric.exerciseMinutes),
    walkingRunningDistanceKm: numberOrNull(metric.walkingRunningDistanceKm),
    wearable: {
      sourceDevice: metric.sourceDevice || null,
      sourceBundle: metric.sourceBundle || null,
      transport: payload.transport || (isAppleHealthBridgeAvailable() ? 'healthkit' : 'shortcuts_bridge'),
      importedAt: exportedAt
    },
    updatedAt: exportedAt
  })).filter(item => item.date);

  const activities = (payload.activities || []).map(activity => {
    const externalId = `apple-health:${activity.externalId || activity.uuid}`;
    return {
      id: stableRecordId(externalId),
      externalId,
      date: activity.date,
      startTime: activity.startTime || null,
      endTime: activity.endTime || null,
      name: activity.name || activity.type || 'Apple Health Workout',
      type: activity.type || 'Workout',
      durationMin: numberOrZero(activity.durationMin),
      distanceKm: numberOrZero(activity.distanceKm),
      elevationGainM: numberOrZero(activity.elevationGainM),
      elevationLossM: numberOrZero(activity.elevationLossM),
      avgHr: numberOrNull(activity.avgHr),
      maxHr: numberOrNull(activity.maxHr),
      maxHrReference,
      activeEnergyKcal: numberOrNull(activity.activeEnergyKcal),
      rpe: numberOrNull(activity.rpe),
      terrain: activity.terrain || inferTerrain(activity),
      isNight: Boolean(activity.isNight),
      source: 'apple_health',
      sourceDevice: activity.sourceDevice || null,
      sourceBundle: activity.sourceBundle || null,
      importedAt: exportedAt
    };
  }).filter(item => item.date && item.externalId);

  const bodyComposition = (payload.bodyComposition || []).map(record => ({
    id: record.id || stableRecordId(`apple-health-body:${record.date}:${record.type || 'summary'}`),
    date: record.date,
    measuredAt: record.measuredAt || null,
    weightKg: numberOrNull(record.weightKg),
    percentBodyFat: numberOrNull(record.percentBodyFat),
    leanBodyMassKg: numberOrNull(record.leanBodyMassKg),
    heightCm: numberOrNull(record.heightCm),
    source: 'apple_health',
    sourceDevice: record.sourceDevice || null,
    importedAt: exportedAt
  })).filter(item => item.date);

  return { checkins, activities, bodyComposition, exportedAt, raw: payload };
}

export async function importAppleHealthPayload(appStore, payload) {
  const state = appStore.getState();
  const normalized = normalizeAppleHealthPayload(payload, state.settings);
  const mergedCheckins = normalized.checkins.map(incoming => mergeCheckin(
    state.checkins.find(existing => existing.date === incoming.date),
    incoming
  ));

  if (mergedCheckins.length) await appStore.upsertMany(STORES.CHECKINS, mergedCheckins);
  const activityImport = normalized.activities.length
    ? await importActivitiesWithDedup(appStore, normalized.activities, { provider: 'apple_health' })
    : { added: 0, updated: 0, merged: 0, review: 0 };
  if (normalized.bodyComposition.length) await appStore.upsertMany(STORES.BODY_COMPOSITION, normalized.bodyComposition);

  await appStore.upsertRecord(STORES.META, {
    id: 'apple_health_sync',
    provider: 'apple_health',
    status: 'success',
    lastSyncAt: normalized.exportedAt,
    range: payload.range || null,
    transport: payload.transport || (isAppleHealthBridgeAvailable() ? 'healthkit' : 'shortcuts_bridge'),
    counts: {
      dailyMetrics: normalized.checkins.length,
      activities: normalized.activities.length,
      bodyComposition: normalized.bodyComposition.length
    },
    activityImport,
    schemaVersion: payload.schemaVersion || 1
  });

  return {
    checkins: normalized.checkins.length,
    activities: normalized.activities.length,
    activityImport,
    bodyComposition: normalized.bodyComposition.length,
    exportedAt: normalized.exportedAt
  };
}

function mergeCheckin(existing, incoming) {
  if (!existing) return incoming;
  const subjectiveKeys = [
    'sleepQuality', 'fatigue', 'stress', 'muscleSoreness', 'pain',
    'painWithWalking', 'alteredGait', 'swelling', 'illnessSymptoms',
    'unusualDizziness', 'note'
  ];
  const merged = { ...existing, ...incoming };
  for (const key of subjectiveKeys) {
    if (existing[key] !== undefined && existing[key] !== null) merged[key] = existing[key];
  }
  merged.sources = [...new Set([...(existing.sources || [existing.source]).filter(Boolean), 'apple_health'])];
  merged.source = merged.sources.length > 1 ? 'hybrid' : 'apple_health';
  merged.createdAt = existing.createdAt || incoming.updatedAt;
  return merged;
}

function inferTerrain(activity) {
  const text = `${activity.name || ''} ${activity.type || ''}`.toLowerCase();
  if (/trail|hike|hiking|mountain/.test(text)) return 'trail';
  if (/strength|functional|traditional strength/.test(text)) return 'strength';
  if (/treadmill/.test(text)) return 'treadmill';
  return 'road';
}

function stableRecordId(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `ah-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function numberOrZero(value) {
  return numberOrNull(value) || 0;
}

function createShortcutError(message, response, payload = {}) {
  const error = new Error(message);
  error.status = Number(response?.status || 0);
  error.code = payload?.code || null;
  return error;
}
