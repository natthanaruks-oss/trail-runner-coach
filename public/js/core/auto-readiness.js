import { addDays, daysBetween, localDateKey } from './date.js';
import { getSyncState, runAutoSync } from '../adapters/sync-manager.js';
import { reconcilePlanWorkouts } from './plan-reconciliation.js';

const METRIC_RULES = Object.freeze({
  sleepHours: { label: 'Sleep', unit: 'h', freshDays: 1, usableDays: 1 },
  restingHr: { label: 'Resting HR', unit: 'bpm', freshDays: 1, usableDays: 2 },
  hrvMs: { label: 'HRV', unit: 'ms', freshDays: 1, usableDays: 2 },
  steps: { label: 'Steps', unit: '', freshDays: 0, usableDays: 1 },
  activeEnergyKcal: { label: 'Active energy', unit: 'kcal', freshDays: 0, usableDays: 1 },
  exerciseMinutes: { label: 'Exercise', unit: 'min', freshDays: 0, usableDays: 1 },
  walkingRunningDistanceKm: { label: 'Daily distance', unit: 'km', freshDays: 0, usableDays: 1 }
});

const OBJECTIVE_KEYS = Object.freeze(Object.keys(METRIC_RULES));
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

export function selectLatestReadinessMetric(checkins = [], key, dateKey = localDateKey()) {
  const rule = METRIC_RULES[key];
  if (!rule) return null;
  const rows = checkins
    .filter(item => item?.date && item.date <= dateKey && finite(item[key]))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const row = rows[0];
  if (!row) return null;
  const ageDays = Math.max(0, daysBetween(row.date, dateKey));
  if (ageDays > rule.usableDays) return null;
  return {
    key,
    label: rule.label,
    unit: rule.unit,
    value: Number(row[key]),
    date: row.date,
    ageDays,
    freshness: ageDays <= rule.freshDays ? 'fresh' : 'usable',
    sources: sourceList(row)
  };
}

export function buildAutoReadinessContext({ checkins = [], dateKey = localDateKey(), existing = null } = {}) {
  const metricEntries = OBJECTIVE_KEYS.map(key => {
    if (finite(existing?.[key])) {
      const date = existing.autoMetricDates?.[key] || existing.date || dateKey;
      const ageDays = Math.max(0, daysBetween(date, dateKey));
      const rule = METRIC_RULES[key];
      return {
        key,
        label: rule.label,
        unit: rule.unit,
        value: Number(existing[key]),
        date,
        ageDays,
        freshness: ageDays <= rule.freshDays ? 'fresh' : ageDays <= rule.usableDays ? 'usable' : 'stale',
        sources: sourceList(existing)
      };
    }
    return selectLatestReadinessMetric(checkins, key, dateKey);
  }).filter(Boolean);

  const metrics = Object.fromEntries(metricEntries.map(item => [item.key, item]));
  const objectiveCoverage = OBJECTIVE_KEYS.length ? metricEntries.length / OBJECTIVE_KEYS.length : 0;
  const freshCount = metricEntries.filter(item => item.freshness === 'fresh').length;
  const staleCount = metricEntries.filter(item => item.freshness === 'stale').length;
  const confidence = Math.round(Math.max(0, Math.min(100,
    objectiveCoverage * 70 + (freshCount / Math.max(1, metricEntries.length)) * 30 - staleCount * 8
  )));
  const lastMetricDate = metricEntries.map(item => item.date).sort().at(-1) || null;

  return {
    dateKey,
    metrics,
    metricEntries,
    autoMetricDates: Object.fromEntries(metricEntries.map(item => [item.key, item.date])),
    values: Object.fromEntries(metricEntries.map(item => [item.key, item.value])),
    sources: [...new Set(metricEntries.flatMap(item => item.sources || []))],
    objectiveCoveragePct: Math.round(objectiveCoverage * 100),
    confidence,
    lastMetricDate,
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
    autoReadiness: {
      coveragePct: context.objectiveCoveragePct,
      confidence: context.confidence,
      generatedAt: new Date().toISOString(),
      latestMetricDate: context.lastMetricDate
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
  if (metric.date === dateKey) return language === 'en' ? 'Today' : 'วันนี้';
  if (metric.ageDays === 1) return language === 'en' ? 'Latest: yesterday' : 'ล่าสุด: เมื่อวาน';
  return language === 'en' ? `Latest: ${metric.date}` : `ล่าสุด ${metric.date}`;
}

export { METRIC_RULES, OBJECTIVE_KEYS };
