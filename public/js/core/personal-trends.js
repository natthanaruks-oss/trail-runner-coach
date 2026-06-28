import { dateRange, localDateKey } from './date.js';
import { dailyLoad } from '../engines/strain.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const round = (value, digits = 0) => {
  if (!finite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
};

export const PERSONAL_TREND_RANGES = Object.freeze([7, 28, 90]);

export const PERSONAL_BASELINE_METRICS = Object.freeze([
  { key: 'sleepHours', direction: 'higher', precision: 2, minBand: 0.35 },
  { key: 'restingHr', direction: 'lower', precision: 0, minBand: 2 },
  { key: 'hrvMs', direction: 'higher', precision: 0, minBand: 5 }
]);

/**
 * Builds athlete-specific trends without exposing provider labels.
 * Baselines are descriptive rolling ranges, not medical reference ranges.
 */
export function buildPersonalTrends({
  healthRows = [],
  activities = [],
  endDateKey = localDateKey(),
  rangeDays = 28,
  sleepTargetHours = 7.5
} = {}) {
  const safeRange = PERSONAL_TREND_RANGES.includes(Number(rangeDays)) ? Number(rangeDays) : 28;
  const rows = normalizeHealthRows(healthRows, endDateKey, safeRange);
  const baselines = Object.fromEntries(PERSONAL_BASELINE_METRICS.map(definition => [
    definition.key,
    buildMetricBaseline(rows, definition)
  ]));
  const sleepDebt = buildSleepDebt(rows, sleepTargetHours);
  const sleepConsistency = buildSleepConsistency(rows);
  const associations = buildAssociations(rows);
  const load = buildFitnessFatigueForm(activities, endDateKey, Math.max(90, safeRange));
  const confidence = buildTrendConfidence({ rows, baselines, load, rangeDays: safeRange });

  return {
    rangeDays: safeRange,
    rows,
    baselines,
    sleepDebt,
    sleepConsistency,
    associations,
    load,
    confidence,
    coverage: {
      healthDays: rows.filter(row => PERSONAL_BASELINE_METRICS.some(item => finite(row[item.key]))).length,
      rangeDays: safeRange,
      activeLoadDays: load.activeDays,
      baselineMetrics: Object.values(baselines).filter(item => item.sampleCount >= 3).length
    }
  };
}

export function buildMetricBaseline(rows = [], definition = PERSONAL_BASELINE_METRICS[0]) {
  const usable = rows
    .filter(row => row?.date && finite(row?.[definition.key]))
    .map(row => ({ date: row.date, value: Number(row[definition.key]) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = usable.at(-1) || null;
  const historical = (usable.length >= 4 ? usable.slice(0, -1) : usable).slice(-28);
  const values = historical.map(item => item.value);
  const baseline = average(values);
  const deviation = latest && baseline != null ? latest.value - baseline : null;
  const deviationPct = deviation != null && Math.abs(baseline) > 0.0001 ? (deviation / baseline) * 100 : null;
  const spread = standardDeviation(values);
  const adaptiveBand = baseline == null ? null : Math.max(definition.minBand, spread || 0);
  const lower = baseline == null ? null : baseline - adaptiveBand;
  const upper = baseline == null ? null : baseline + adaptiveBand;
  const zScore = deviation != null && spread > 0 ? deviation / spread : null;
  const status = classifyMetric(definition.direction, latest?.value ?? null, lower, upper);

  return {
    ...definition,
    latestValue: latest?.value ?? null,
    latestDate: latest?.date || null,
    baseline: round(baseline, definition.precision),
    lower: round(lower, definition.precision),
    upper: round(upper, definition.precision),
    spread: round(spread, definition.precision),
    deviation: round(deviation, definition.precision),
    deviationPct: round(deviationPct, 1),
    zScore: round(zScore, 2),
    status,
    sampleCount: values.length,
    series: rows.map(row => ({
      date: row.date,
      value: finite(row?.[definition.key]) ? Number(row[definition.key]) : null,
      baseline: round(baseline, definition.precision),
      lower: round(lower, definition.precision),
      upper: round(upper, definition.precision)
    }))
  };
}

export function buildSleepDebt(rows = [], targetHours = 7.5) {
  const target = clamp(finite(targetHours) ? Number(targetHours) : 7.5, 4, 12);
  const recent = rows.slice(-7);
  const available = recent.filter(row => finite(row?.sleepHours));
  const deficit = available.reduce((sum, row) => sum + Math.max(0, target - Number(row.sleepHours)), 0);
  const surplus = available.reduce((sum, row) => sum + Math.max(0, Number(row.sleepHours) - target), 0);
  const netDebt = Math.max(0, deficit - surplus);
  const averageSleep = average(available.map(row => Number(row.sleepHours)));
  return {
    targetHours: round(target, 1),
    observedDays: available.length,
    windowDays: 7,
    averageSleepHours: round(averageSleep, 2),
    deficitHours: round(deficit, 2),
    recoveryCreditHours: round(surplus, 2),
    netDebtHours: round(netDebt, 2),
    status: available.length < 3 ? 'insufficient' : netDebt >= 7 ? 'high' : netDebt >= 3 ? 'watch' : 'low'
  };
}


export function buildSleepConsistency(rows = []) {
  const values = rows.slice(-28).filter(row => finite(row?.sleepHours)).map(row => Number(row.sleepHours));
  const spread = standardDeviation(values);
  const score = values.length < 3 ? null : Math.round(clamp(100 - spread * 32, 0, 100));
  return {
    observedDays: values.length,
    standardDeviationHours: round(spread, 2),
    score,
    status: score == null ? 'insufficient' : score >= 80 ? 'consistent' : score >= 60 ? 'variable' : 'irregular'
  };
}

export function buildAssociations(rows = []) {
  return {
    sleepVsRhr: buildAssociation(rows, 'sleepHours', 'restingHr'),
    sleepVsHrv: buildAssociation(rows, 'sleepHours', 'hrvMs')
  };
}

export function buildFitnessFatigueForm(activities = [], endDateKey = localDateKey(), days = 90) {
  const safeDays = clamp(Number(days) || 90, 28, 180);
  const dates = dateRange(endDateKey, safeDays);
  const daily = dates.map(date => ({ date, load: Number(dailyLoad(activities, date).totalLoad || 0) }));
  const fitnessAlpha = 1 - Math.exp(-1 / 42);
  const fatigueAlpha = 1 - Math.exp(-1 / 7);
  let fitness = 0;
  let fatigue = 0;
  const series = daily.map((item, index) => {
    if (index === 0) {
      fitness = item.load;
      fatigue = item.load;
    } else {
      fitness += fitnessAlpha * (item.load - fitness);
      fatigue += fatigueAlpha * (item.load - fatigue);
    }
    return {
      date: item.date,
      load: Math.round(item.load),
      fitness: round(fitness, 1),
      fatigue: round(fatigue, 1),
      form: round(fitness - fatigue, 1)
    };
  });
  const latest = series.at(-1) || { fitness: 0, fatigue: 0, form: 0 };
  const activeDays = daily.filter(item => item.load > 0).length;
  const status = classifyForm(latest.form, latest.fitness, activeDays);
  return {
    ...latest,
    status,
    activeDays,
    historyDays: safeDays,
    series,
    method: 'ewma_42_7'
  };
}

function normalizeHealthRows(rows, endDateKey, rangeDays) {
  const byDate = new Map((Array.isArray(rows) ? rows : [])
    .filter(row => row?.date && row.date <= endDateKey)
    .map(row => [row.date, row]));
  return dateRange(endDateKey, rangeDays).map(date => ({ date, ...(byDate.get(date) || {}) }));
}


function buildAssociation(rows, xKey, yKey) {
  const pairs = rows.filter(row => finite(row?.[xKey]) && finite(row?.[yKey])).map(row => [Number(row[xKey]), Number(row[yKey])]);
  if (pairs.length < 5) return { coefficient: null, sampleCount: pairs.length, strength: 'insufficient', direction: 'none' };
  const xs = pairs.map(pair => pair[0]);
  const ys = pairs.map(pair => pair[1]);
  const meanX = average(xs);
  const meanY = average(ys);
  const numerator = pairs.reduce((sum, pair) => sum + (pair[0] - meanX) * (pair[1] - meanY), 0);
  const denominator = Math.sqrt(xs.reduce((sum, value) => sum + ((value - meanX) ** 2), 0) * ys.reduce((sum, value) => sum + ((value - meanY) ** 2), 0));
  const coefficient = denominator > 0 ? numerator / denominator : 0;
  const magnitude = Math.abs(coefficient);
  return {
    coefficient: round(coefficient, 2),
    sampleCount: pairs.length,
    strength: magnitude >= .65 ? 'strong' : magnitude >= .35 ? 'moderate' : 'weak',
    direction: coefficient > .08 ? 'positive' : coefficient < -.08 ? 'negative' : 'none'
  };
}

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const mean = average(values);
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  return Math.sqrt(variance);
}

function classifyMetric(direction, value, lower, upper) {
  if (![value, lower, upper].every(finite)) return 'unknown';
  if (direction === 'lower') {
    if (value > upper) return 'risk';
    if (value < lower) return 'good';
    return 'normal';
  }
  if (direction === 'higher') {
    if (value < lower) return 'risk';
    if (value > upper) return 'good';
    return 'normal';
  }
  return 'normal';
}

function classifyForm(form, fitness, activeDays) {
  if (activeDays < 4) return 'building';
  const reference = Math.max(20, Math.abs(Number(fitness) || 0));
  const ratio = Number(form || 0) / reference;
  if (ratio <= -0.35) return 'fatigued';
  if (ratio >= 0.18) return 'fresh';
  return 'balanced';
}

function buildTrendConfidence({ rows, baselines, load, rangeDays }) {
  const healthCoverage = rows.filter(row => PERSONAL_BASELINE_METRICS.some(item => finite(row[item.key]))).length / Math.max(1, rangeDays);
  const baselineCoverage = Object.values(baselines).reduce((sum, item) => sum + Math.min(1, item.sampleCount / 14), 0) / PERSONAL_BASELINE_METRICS.length;
  const loadCoverage = Math.min(1, load.activeDays / 12);
  return Math.round(clamp((healthCoverage * 0.35 + baselineCoverage * 0.4 + loadCoverage * 0.25) * 100, 0, 100));
}
