import { addDays, daysBetween, localDateKey } from './date.js';
import { getSyncState, runAutoSync } from '../adapters/sync-manager.js';
import { reconcilePlanWorkouts } from './plan-reconciliation.js';

const METRIC_RULES = Object.freeze({
  sleepHours: { label: 'Sleep', unit: 'h', freshDays: 0, usableDays: 1, period: 'overnight' },
  restingHr: { label: 'Resting HR', unit: 'bpm', freshDays: 0, usableDays: 1, period: 'overnight' },
  hrvMs: { label: 'HRV', unit: 'ms', freshDays: 0, usableDays: 1, period: 'overnight' },
  steps: { label: 'Steps', unit: '', freshDays: 0, usableDays: 0, period: 'current_day' },
  activeEnergyKcal: { label: 'Active energy', unit: 'kcal', freshDays: 0, usableDays: 0, period: 'current_day' },
  exerciseMinutes: { label: 'Exercise', unit: 'min', freshDays: 0, usableDays: 0, period: 'current_day' },
  walkingRunningDistanceKm: { label: 'Daily distance', unit: 'km', freshDays: 0, usableDays: 0, period: 'current_day' }
});

const OBJECTIVE_KEYS = Object.freeze(Object.keys(METRIC_RULES));
const OVERNIGHT_RECOVERY_KEYS = Object.freeze(['sleepHours', 'restingHr', 'hrvMs']);
const SUBJECTIVE_KEYS = Object.freeze([
  'sleepQuality', 'fatigue', 'stress', 'muscleSoreness', 'pain',
  'painWithWalking', 'alteredGait', 'swelling', 'illnessSymptoms',
  'unusualDizziness', 'note'
]);

function finite(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function sourceList(record) {
  return [...new Set([...(record?.sources || []), record?.source].filter(Boolean).filter(value => value !== 'hybrid'))];
}

function isHealthAutoExportRecord(record) {
  const transport = String(record?.wearable?.transport || record?.transport || '').toLowerCase();
  const bundle = String(record?.wearable?.sourceBundle || record?.sourceBundle || '').toLowerCase();
  return transport === 'health_auto_export' || bundle.includes('healthautoexport');
}

function isOvernightRecoveryKey(key) {
  return OVERNIGHT_RECOVERY_KEYS.includes(key);
}

export function resolveReadinessMetricDate(record, key, sourceDate = record?.date) {
  if (!sourceDate) return { sourceDate: null, effectiveDate: null, alignment: 'unknown' };
  if (isOvernightRecoveryKey(key) && isHealthAutoExportRecord(record)) {
    return {
      sourceDate,
      effectiveDate: addDays(sourceDate, 1),
      alignment: 'overnight_to_wake_day'
    };
  }
  return {
    sourceDate,
    effectiveDate: sourceDate,
    alignment: isOvernightRecoveryKey(key) ? 'same_day_recovery' : 'calendar_day'
  };
}

function metricFromRecord(record, key, dateKey) {
  const rule = METRIC_RULES[key];
  if (!rule || !finite(record?.[key])) return null;
  const sourceDate = record?.autoMetricDates?.[key] || record?.date || null;
  const storedEffectiveDate = record?.autoMetricEffectiveDates?.[key] || null;
  const resolved = storedEffectiveDate
    ? {
        sourceDate,
        effectiveDate: storedEffectiveDate,
        alignment: record?.autoMetricAlignments?.[key] || (isOvernightRecoveryKey(key) ? 'overnight_to_wake_day' : 'calendar_day')
      }
    : resolveReadinessMetricDate(record, key, sourceDate);
  if (!resolved.effectiveDate || resolved.effectiveDate > dateKey) return null;
  const ageDays = Math.max(0, daysBetween(resolved.effectiveDate, dateKey));
  if (ageDays > rule.usableDays) return null;
  return {
    key,
    label: rule.label,
    unit: rule.unit,
    value: Number(record[key]),
    date: resolved.sourceDate,
    sourceDate: resolved.sourceDate,
    effectiveDate: resolved.effectiveDate,
    readinessDate: resolved.effectiveDate,
    ageDays,
    freshness: ageDays <= rule.freshDays ? 'fresh' : 'usable',
    alignment: resolved.alignment,
    period: rule.period,
    sources: sourceList(record)
  };
}

export function selectLatestReadinessMetric(checkins = [], key, dateKey = localDateKey()) {
  const candidates = checkins
    .map(record => metricFromRecord(record, key, dateKey))
    .filter(Boolean)
    .sort((a, b) => {
      const effective = String(b.effectiveDate).localeCompare(String(a.effectiveDate));
      if (effective) return effective;
      return String(b.sourceDate).localeCompare(String(a.sourceDate));
    });
  return candidates[0] || null;
}

export function buildAutoReadinessContext({ checkins = [], dateKey = localDateKey(), existing = null } = {}) {
  const metricEntries = OBJECTIVE_KEYS.map(key => {
    const existingMetric = finite(existing?.[key]) ? metricFromRecord(existing, key, dateKey) : null;
    return existingMetric || selectLatestReadinessMetric(checkins, key, dateKey);
  }).filter(Boolean);

  const metrics = Object.fromEntries(metricEntries.map(item => [item.key, item]));
  const objectiveCoverage = OBJECTIVE_KEYS.length ? metricEntries.length / OBJECTIVE_KEYS.length : 0;
  const freshCount = metricEntries.filter(item => item.freshness === 'fresh').length;
  const staleCount = metricEntries.filter(item => item.freshness === 'stale').length;
  const confidence = Math.round(Math.max(0, Math.min(100,
    objectiveCoverage * 70 + (freshCount / Math.max(1, metricEntries.length)) * 30 - staleCount * 8
  )));
  const lastMetricDate = metricEntries.map(item => item.effectiveDate).sort().at(-1) || null;
  const lastSourceMetricDate = metricEntries.map(item => item.sourceDate).sort().at(-1) || null;

  return {
    dateKey,
    metrics,
    metricEntries,
    autoMetricDates: Object.fromEntries(metricEntries.map(item => [item.key, item.sourceDate])),
    autoMetricEffectiveDates: Object.fromEntries(metricEntries.map(item => [item.key, item.effectiveDate])),
    autoMetricAlignments: Object.fromEntries(metricEntries.map(item => [item.key, item.alignment])),
    values: Object.fromEntries(metricEntries.map(item => [item.key, item.value])),
    sources: [...new Set(metricEntries.flatMap(item => item.sources || []))],
    objectiveCoveragePct: Math.round(objectiveCoverage * 100),
    confidence,
    lastMetricDate,
    lastSourceMetricDate,
    recoveryDatePolicy: 'wake_day_v1',
    hasObjectiveData: metricEntries.length > 0,
    missingKeys: OBJECTIVE_KEYS.filter(key => !metrics[key])
  };
}

export function buildReadinessDraft({ existing = null, checkins = [], dateKey = localDateKey() } = {}) {
  const context = buildAutoReadinessContext({ checkins, dateKey, existing });
  const draft = {
    ...(existing || {}),
    date: dateKey,
    ...context.values,
    autoMetricDates: context.autoMetricDates,
    autoMetricEffectiveDates: context.autoMetricEffectiveDates,
    autoMetricAlignments: context.autoMetricAlignments,
    autoReadiness: {
      coveragePct: context.objectiveCoveragePct,
      confidence: context.confidence,
      generatedAt: new Date().toISOString(),
      latestMetricDate: context.lastMetricDate,
      latestSourceMetricDate: context.lastSourceMetricDate,
      recoveryDatePolicy: context.recoveryDatePolicy
    }
  };
  for (const key of SUBJECTIVE_KEYS) {
    if (existing?.[key] !== undefined) draft[key] = existing[key];
  }
  const sources = [...new Set([...(existing?.sources || []), ...context.sources, 'manual'].filter(Boolean).filter(value => value !== 'hybrid'))];
  draft.sources = sources;
  draft.source = sources.length > 1 ? 'hybrid' : (sources[0] || 'manual');
  return { draft, context };
}

export function isReadinessSyncStale(state, maxAgeMinutes = 15, now = Date.now()) {
  const sync = getSyncState(state);
  const successes = Object.values(sync.providers || {})
    .map(provider => Date.parse(provider?.lastSuccessAt || ''))
    .filter(Number.isFinite);
  if (!successes.length) return true;
  return now - Math.max(...successes) > Math.max(5, Number(maxAgeMinutes) || 15) * 60_000;
}

export async function syncReadinessAndPlan(appStore, { force = true, reason = 'readiness_check', days = 90 } = {}) {
  const syncResult = await runAutoSync(appStore, { force, reason });
  const planResult = await reconcilePlanWorkouts(appStore, { reason, days });
  return { syncResult, planResult };
}

export function readinessFreshnessLabel(metric, dateKey = localDateKey(), language = 'th') {
  if (!metric) return language === 'en' ? 'No data' : 'ไม่มีข้อมูล';
  if (metric.alignment === 'overnight_to_wake_day' && metric.effectiveDate === dateKey) {
    return language === 'en' ? 'Last night · used for today' : 'เมื่อคืน · ใช้กับวันนี้ทั้งวัน';
  }
  if (metric.period === 'overnight' && metric.effectiveDate === dateKey) {
    return language === 'en' ? 'This morning' : 'เช้านี้';
  }
  if (metric.effectiveDate === dateKey) return language === 'en' ? 'Today' : 'วันนี้';
  if (metric.ageDays === 1 && metric.period === 'overnight') return language === 'en' ? 'Latest usable recovery night' : 'คืนล่าสุดที่ใช้ได้';
  if (metric.ageDays === 1) return language === 'en' ? 'Latest: yesterday' : 'ล่าสุด: เมื่อวาน';
  return language === 'en' ? `Latest: ${metric.sourceDate || metric.date}` : `ล่าสุด ${metric.sourceDate || metric.date}`;
}

export { METRIC_RULES, OBJECTIVE_KEYS, OVERNIGHT_RECOVERY_KEYS };
