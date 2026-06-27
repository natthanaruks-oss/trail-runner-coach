import { dateRange, localDateKey } from './date.js';
import { energyBalanceForDate, nutritionTarget } from './nutrition.js';

const RECOVERY_KEYS = Object.freeze(['sleepHours', 'restingHr', 'hrvMs']);
const BEHAVIOR_KEYS = Object.freeze(['steps', 'activeEnergyKcal', 'exerciseMinutes']);
const DISPLAY_KEYS = Object.freeze([
  'steps', 'activeEnergyKcal', 'exerciseMinutes', 'walkingRunningDistanceKm',
  'sleepHours', 'restingHr', 'hrvMs'
]);

export function selectAppleHealthInsights(state, dateKey = localDateKey(), days = 7) {
  const checkin = state.checkins.find(item => item.date === dateKey) || null;
  const appleCheckin = hasAppleHealthSource(checkin) ? checkin : null;
  const rows = dateRange(dateKey, Math.max(1, Math.min(30, Number(days) || 7))).map(date => {
    const item = state.checkins.find(record => record.date === date && hasAppleHealthSource(record)) || null;
    return {
      date,
      checkin: item,
      steps: finiteOrNull(item?.steps),
      activeEnergyKcal: finiteOrNull(item?.activeEnergyKcal),
      exerciseMinutes: finiteOrNull(item?.exerciseMinutes),
      walkingRunningDistanceKm: finiteOrNull(item?.walkingRunningDistanceKm),
      sleepHours: finiteOrNull(item?.sleepHours),
      restingHr: finiteOrNull(item?.restingHr),
      hrvMs: finiteOrNull(item?.hrvMs)
    };
  });

  const syncMeta = latestAppleHealthSyncMeta(state.metadata || []);
  const latestBody = [...(state.bodyComposition || [])]
    .filter(item => item.source === 'apple_health')
    .sort((a, b) => String(b.measuredAt || b.date).localeCompare(String(a.measuredAt || a.date)))[0] || null;
  const target = nutritionTarget(state, dateKey);
  const energyBalance = energyBalanceForDate(state, dateKey);
  const metrics = Object.fromEntries(DISPLAY_KEYS.map(key => [key, finiteOrNull(appleCheckin?.[key])]));
  const availableKeys = DISPLAY_KEYS.filter(key => metrics[key] != null);
  const recoveryAvailable = RECOVERY_KEYS.filter(key => metrics[key] != null).length;
  const behaviorAvailable = BEHAVIOR_KEYS.filter(key => metrics[key] != null).length;

  return {
    dateKey,
    checkin: appleCheckin,
    hasData: availableKeys.length > 0,
    partial: availableKeys.length > 0 && availableKeys.length < DISPLAY_KEYS.length,
    availableKeys,
    metrics,
    wearable: appleCheckin?.wearable || null,
    source: appleCheckin?.source || null,
    lastImportedAt: appleCheckin?.wearable?.importedAt || syncMeta?.lastSuccessAt || syncMeta?.lastSyncAt || null,
    syncMeta,
    latestBody,
    recoveryAvailable,
    recoveryTotal: RECOVERY_KEYS.length,
    behaviorAvailable,
    behaviorTotal: BEHAVIOR_KEYS.length,
    nutrition: {
      target,
      balance: energyBalance,
      usesAppleActiveEnergy: target.activitySource === 'apple_health'
    },
    trend: buildTrend(rows),
    rows
  };
}

export function hasAppleHealthSource(record) {
  if (!record) return false;
  if (record.source === 'apple_health') return true;
  if (Array.isArray(record.sources) && record.sources.includes('apple_health')) return true;
  return record.wearable?.transport === 'shortcuts_bridge' || record.wearable?.transport === 'healthkit';
}

function latestAppleHealthSyncMeta(metadata) {
  const direct = metadata.find(item => item.id === 'apple_health_sync') || null;
  const syncState = metadata.find(item => item.id === 'provider_sync_state_v1') || null;
  const provider = syncState?.providers?.apple_health || null;
  if (!direct && !provider) return null;
  return {
    ...(direct || {}),
    ...(provider || {}),
    lastSyncAt: direct?.lastSyncAt || direct?.updatedAt || null,
    lastSuccessAt: provider?.lastSuccessAt || direct?.lastSyncAt || direct?.updatedAt || null
  };
}

function buildTrend(rows) {
  const averages = {};
  for (const key of DISPLAY_KEYS) {
    const values = rows.map(item => item[key]).filter(value => value != null);
    averages[key] = values.length
      ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(key === 'steps' || key === 'activeEnergyKcal' || key === 'exerciseMinutes' || key === 'restingHr' ? 0 : 1))
      : null;
  }
  return {
    days: rows.length,
    rows,
    averages,
    coverageDays: rows.filter(item => item.checkin).length,
    recoveryCoverageDays: rows.filter(item => RECOVERY_KEYS.some(key => item[key] != null)).length,
    behaviorCoverageDays: rows.filter(item => BEHAVIOR_KEYS.some(key => item[key] != null)).length
  };
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
