import { STORES } from '../core/constants.js';
import { nowIso } from '../core/date.js';
import { importActivitiesWithDedup } from './activity-import.js';

export function normalizeGoogleHealthPayload(payload, settings = {}) {
  if (!payload || payload.source !== 'google_health') throw new Error('Google Health payload ไม่ถูกต้อง');
  const exportedAt = payload.exportedAt || nowIso();
  const maxHrReference = Number(settings?.athlete?.maxHr) || null;
  const checkins = (payload.dailyMetrics || []).map(metric => ({
    date: metric.date,
    source: 'google_health',
    sources: ['google_health'],
    sleepHours: numberOrNull(metric.sleepHours),
    sleepQuality: null,
    restingHr: numberOrNull(metric.restingHr),
    hrvMs: numberOrNull(metric.hrvMs),
    activeEnergyKcal: numberOrNull(metric.activeEnergyKcal),
    steps: numberOrNull(metric.steps),
    exerciseMinutes: numberOrNull(metric.exerciseMinutes),
    walkingRunningDistanceKm: numberOrNull(metric.walkingRunningDistanceKm),
    wearable: {
      sourceDevice: metric.sourceDevice || 'Google Health / Fitbit',
      importedAt: exportedAt
    },
    updatedAt: exportedAt
  })).filter(item => item.date);

  const activities = (payload.activities || []).map(activity => ({
    ...activity,
    id: activity.id || stableRecordId(activity.externalId || `${activity.date}-${activity.startTime || activity.name}`),
    externalId: normalizeExternalId(activity.externalId),
    maxHrReference,
    source: 'google_health',
    sourceDevice: activity.sourceDevice || 'Google Health / Fitbit',
    importedAt: activity.importedAt || exportedAt
  })).filter(item => item.date && item.externalId);

  const bodyComposition = (payload.bodyComposition || []).map(record => ({
    id: record.id || stableRecordId(`body:${record.date}:${record.measuredAt || ''}`),
    date: record.date,
    measuredAt: record.measuredAt || null,
    weightKg: numberOrNull(record.weightKg),
    percentBodyFat: numberOrNull(record.percentBodyFat),
    leanBodyMassKg: numberOrNull(record.leanBodyMassKg),
    heightCm: numberOrNull(record.heightCm),
    source: 'google_health',
    sourceDevice: record.sourceDevice || 'Google Health / Fitbit',
    importedAt: exportedAt
  })).filter(item => item.date);

  return { checkins, activities, bodyComposition, exportedAt, warnings: payload.warnings || [] };
}

export async function importGoogleHealthPayload(appStore, payload) {
  const state = appStore.getState();
  const normalized = normalizeGoogleHealthPayload(payload, state.settings);
  const mergedCheckins = normalized.checkins.map(incoming => mergeCheckin(
    state.checkins.find(existing => existing.date === incoming.date), incoming
  ));
  if (mergedCheckins.length) await appStore.upsertMany(STORES.CHECKINS, mergedCheckins);
  const activityImport = normalized.activities.length
    ? await importActivitiesWithDedup(appStore, normalized.activities, { provider: 'google_health' })
    : { added: 0, updated: 0, merged: 0, review: 0 };
  if (normalized.bodyComposition.length) await appStore.upsertMany(STORES.BODY_COMPOSITION, normalized.bodyComposition);

  await appStore.upsertRecord(STORES.META, {
    id: 'google_health_sync',
    provider: 'google_health',
    status: 'success',
    lastSyncAt: normalized.exportedAt,
    range: payload.range || null,
    counts: {
      dailyMetrics: normalized.checkins.length,
      activities: normalized.activities.length,
      bodyComposition: normalized.bodyComposition.length
    },
    warnings: normalized.warnings,
    activityImport,
    schemaVersion: payload.schemaVersion || 1
  });

  return {
    checkins: normalized.checkins.length,
    activities: normalized.activities.length,
    activityImport,
    bodyComposition: normalized.bodyComposition.length,
    warnings: normalized.warnings.length,
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
  for (const key of subjectiveKeys) if (existing[key] !== undefined && existing[key] !== null) merged[key] = existing[key];
  merged.sources = [...new Set([...(existing.sources || [existing.source]).filter(Boolean), 'google_health'])];
  merged.source = merged.sources.length > 1 ? 'hybrid' : 'google_health';
  merged.createdAt = existing.createdAt || incoming.updatedAt;
  return merged;
}
function normalizeExternalId(value) { const id = String(value || ''); return id.startsWith('google-health:') ? id : `google-health:${id}`; }
function stableRecordId(value) { let hash = 2166136261; for (const char of String(value)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); } return `gh-${(hash >>> 0).toString(16).padStart(8, '0')}`; }
function numberOrNull(value) { if (value === null || value === undefined || value === '') return null; const number = Number(value); return Number.isFinite(number) ? number : null; }
