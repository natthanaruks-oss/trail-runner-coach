import { calibratedComponentWeight } from './calibration.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const scoreScale = (value, low, high) => clamp(((value - low) / (high - low)) * 100, 0, 100);
const BASE_WEIGHTS = Object.freeze({
  sleepHours: 0.22,
  sleepQuality: 0.09,
  restingHr: 0.20,
  hrv: 0.23,
  fatigue: 0.12,
  stress: 0.07,
  muscleSoreness: 0.07,
  recentStrain: 0.10
});

/**
 * Recovery is a personalized 0-100 estimate, not a diagnosis.
 * Current metrics are compared with the athlete's rolling robust baseline.
 * With enough user feedback, component weights can move within a guarded ±15% range.
 */
export function calculateRecovery(checkin, settings = {}, history = [], context = {}, calibration = null) {
  if (!checkin) {
    return {
      score: null,
      status: 'unknown',
      confidence: 0,
      components: [],
      drivers: [],
      flags: ['missing_checkin'],
      baseline: emptyBaseline(),
      calibrationApplied: false
    };
  }

  const priorHistory = history.filter(item => item.date && item.date < checkin.date);
  const rhrStats = inferRhrStats(priorHistory);
  const hrvStats = inferHrvStats(priorHistory);
  const manualRhrBaseline = Number(settings?.athlete?.restingHrBaseline) || null;
  const restingHrBaseline = manualRhrBaseline || rhrStats.median;
  const hrvBaseline = hrvStats.median;
  const sleepTargetHours = clamp(Number(settings?.athlete?.sleepTargetHours) || 7.5, 6, 10);
  const components = [];
  const flags = [];
  const weight = key => calibratedComponentWeight(key, BASE_WEIGHTS[key], calibration);

  if (finite(checkin.sleepHours)) {
    const hours = Number(checkin.sleepHours);
    const difference = hours - sleepTargetHours;
    const score = difference >= 0 ? clamp(94 + difference * 4, 94, 100)
      : difference >= -0.75 ? 82 + (difference + 0.75) * 16
        : difference >= -1.5 ? 58 + (difference + 1.5) * 32
          : difference >= -2.5 ? 30 + (difference + 2.5) * 28
            : 15;
    components.push(component('sleepHours', score, weight('sleepHours'), hours, { baseline: sleepTargetHours, delta: Number(difference.toFixed(1)) }));
    if (hours < 6) flags.push('short_sleep');
  }

  if (finite(checkin.sleepQuality)) {
    const quality = clamp(Number(checkin.sleepQuality), 1, 5);
    components.push(component('sleepQuality', scoreScale(quality, 1, 5), weight('sleepQuality'), quality));
    if (quality <= 2) flags.push('poor_sleep_quality');
  }

  if (finite(checkin.restingHr) && restingHrBaseline) {
    const restingHr = Number(checkin.restingHr);
    const deltaPct = ((restingHr - restingHrBaseline) / restingHrBaseline) * 100;
    const standardizedDelta = rhrStats.spread ? (restingHr - restingHrBaseline) / rhrStats.spread : null;
    const score = rhrStats.days >= 7 && standardizedDelta != null
      ? scoreRhrStandardized(standardizedDelta)
      : scoreRhrPercent(deltaPct);
    components.push(component('restingHr', score, weight('restingHr'), restingHr, {
      baseline: restingHrBaseline,
      deltaPct: Number(deltaPct.toFixed(1)),
      standardizedDelta: standardizedDelta == null ? null : Number(standardizedDelta.toFixed(2)),
      baselineMethod: manualRhrBaseline ? 'manual_plus_rolling_spread' : rhrStats.days >= 7 ? 'rolling_robust' : 'bootstrap'
    }));
    if ((standardizedDelta != null && standardizedDelta >= 2) || deltaPct >= 7) flags.push('elevated_resting_hr');
  } else if (finite(checkin.restingHr)) {
    flags.push('rhr_baseline_building');
  }

  if (finite(checkin.hrvMs) && Number(checkin.hrvMs) > 0) {
    if (hrvBaseline) {
      const value = Number(checkin.hrvMs);
      const deltaPct = ((value - hrvBaseline) / hrvBaseline) * 100;
      const standardizedDelta = hrvStats.spread ? (value - hrvBaseline) / hrvStats.spread : null;
      const score = hrvStats.days >= 7 && standardizedDelta != null
        ? scoreHrvStandardized(standardizedDelta)
        : scoreHrvPercent(deltaPct);
      components.push(component('hrv', score, weight('hrv'), value, {
        baseline: hrvBaseline,
        deltaPct: Number(deltaPct.toFixed(1)),
        standardizedDelta: standardizedDelta == null ? null : Number(standardizedDelta.toFixed(2)),
        baselineMethod: hrvStats.days >= 7 ? 'rolling_robust' : 'bootstrap'
      }));
      if ((standardizedDelta != null && standardizedDelta <= -1.5) || deltaPct <= -15) flags.push('suppressed_hrv');
    } else {
      flags.push('hrv_baseline_building');
    }
  }

  for (const key of ['fatigue', 'stress', 'muscleSoreness']) {
    if (!finite(checkin[key])) continue;
    const value = clamp(Number(checkin[key]), 1, 5);
    const score = 100 - scoreScale(value, 1, 5);
    components.push(component(key, score, weight(key), value));
    if (value >= 4) flags.push(`high_${key}`);
  }

  const previousDayStrain = Number(context.previousDayStrain?.score ?? context.previousDayStrain) || 0;
  const recentStrainAverage = Number(context.recentStrainAverage) || 0;
  if (previousDayStrain > 0 || recentStrainAverage > 0) {
    const peak = Math.max(previousDayStrain, recentStrainAverage);
    const score = peak < 5 ? 95 : peak < 8 ? 84 : peak < 11 ? 69 : peak < 14 ? 50 : peak < 17 ? 32 : 18;
    components.push(component('recentStrain', score, weight('recentStrain'), peak, {
      previousDay: Number(previousDayStrain.toFixed(1)),
      recentAverage: Number(recentStrainAverage.toFixed(1))
    }));
    if (peak >= 14) flags.push('high_recent_strain');
  }

  if (checkin.illnessSymptoms) flags.push('illness_symptoms');
  if (checkin.unusualDizziness) flags.push('unusual_dizziness');

  if (!components.length) {
    return {
      score: null,
      status: 'unknown',
      confidence: 0,
      components,
      drivers: [],
      flags: [...new Set([...flags, 'missing_metrics'])],
      baseline: buildBaseline(restingHrBaseline, hrvBaseline, priorHistory, rhrStats, hrvStats),
      calibrationApplied: false
    };
  }

  const totalWeight = components.reduce((total, item) => total + item.weight, 0);
  let score = components.reduce((total, item) => total + item.score * item.weight, 0) / totalWeight;
  if (checkin.illnessSymptoms || checkin.unusualDizziness) score = Math.min(score, 20);
  score = Math.round(clamp(score, 0, 100));

  const baseline = buildBaseline(restingHrBaseline, hrvBaseline, priorHistory, rhrStats, hrvStats);
  const metricCoverage = Math.min(1, totalWeight / 0.90);
  const objectiveCount = components.filter(item => ['sleepHours', 'restingHr', 'hrv', 'recentStrain'].includes(item.key)).length;
  const subjectiveCount = components.filter(item => ['sleepQuality', 'fatigue', 'stress', 'muscleSoreness'].includes(item.key)).length;
  const sourceBonus = checkin.source && checkin.source !== 'manual' ? 8 : 0;
  const baselineBonus = Math.min(20, Math.round((Math.min(14, baseline.restingHrDays) / 14) * 8 + (Math.min(21, baseline.hrvDays) / 21) * 12));
  const calibrationBonus = Math.min(7, Math.round((Number(calibration?.confidence) || 0) * 0.07));
  const confidence = Math.round(clamp(metricCoverage * 55 + Math.min(12, objectiveCount * 3) + Math.min(8, subjectiveCount * 2) + sourceBonus + baselineBonus + calibrationBonus, 15, 100));
  const drivers = components
    .map(item => ({ ...item, impact: Number(((item.score - 50) * item.weight / totalWeight).toFixed(1)), direction: item.score >= 55 ? 'positive' : item.score <= 45 ? 'negative' : 'neutral' }))
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

  return {
    score,
    status: recoveryStatus(score),
    confidence,
    components,
    drivers,
    flags: [...new Set(flags)],
    baseline,
    calibrationApplied: Boolean(calibration?.enabled && calibration?.phase !== 'bootstrap'),
    componentWeightModifiers: calibration?.componentModifiers || {},
    dataCoverage: {
      objectiveMetrics: objectiveCount,
      subjectiveMetrics: subjectiveCount,
      weightedCoveragePct: Math.round(metricCoverage * 100)
    }
  };
}

export function inferRhrBaseline(history = []) {
  return inferRhrStats(history).median;
}

export function inferHrvBaseline(history = []) {
  return inferHrvStats(history).median;
}

export function inferRhrStats(history = []) {
  return robustStats(history
    .filter(item => Number(item.restingHr) > 0)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 28)
    .map(item => Number(item.restingHr)), 3, 1.5);
}

export function inferHrvStats(history = []) {
  return robustStats(history
    .filter(item => Number(item.hrvMs) > 0)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 42)
    .map(item => Number(item.hrvMs)), 5, 2.5);
}

export function recoveryStatus(score) {
  if (score == null) return 'unknown';
  if (score >= 75) return 'green';
  if (score >= 50) return 'yellow';
  return 'red';
}

function scoreRhrPercent(deltaPct) {
  return deltaPct <= -2 ? 100 : deltaPct <= 1 ? 92 : deltaPct <= 4 ? 76 : deltaPct <= 7 ? 55 : deltaPct <= 10 ? 35 : 18;
}
function scoreRhrStandardized(z) {
  return z <= -0.5 ? 100 : z <= 0.5 ? 92 : z <= 1.2 ? 76 : z <= 2 ? 55 : z <= 3 ? 35 : 18;
}
function scoreHrvPercent(deltaPct) {
  return deltaPct >= 8 ? 100 : deltaPct >= 0 ? 90 : deltaPct >= -8 ? 76 : deltaPct >= -15 ? 55 : deltaPct >= -25 ? 34 : 18;
}
function scoreHrvStandardized(z) {
  return z >= 0.8 ? 100 : z >= -0.2 ? 90 : z >= -0.8 ? 76 : z >= -1.5 ? 55 : z >= -2.3 ? 34 : 18;
}

function component(key, score, weight, value, extra = {}) {
  return { key, score: Math.round(clamp(score, 0, 100)), weight, value, ...extra };
}

function buildBaseline(restingHr, hrvMs, history, rhrStats = emptyStats(), hrvStats = emptyStats()) {
  return {
    restingHr: restingHr || null,
    hrvMs: hrvMs || null,
    restingHrSpread: rhrStats.spread || null,
    hrvSpread: hrvStats.spread || null,
    restingHrDays: history.filter(item => Number(item.restingHr) > 0).slice(-28).length,
    hrvDays: history.filter(item => Number(item.hrvMs) > 0).slice(-42).length,
    sleepDays: history.filter(item => Number(item.sleepHours) > 0).slice(-28).length,
    method: rhrStats.days >= 7 || hrvStats.days >= 7 ? 'rolling_robust' : 'bootstrap'
  };
}

function emptyBaseline() {
  return { restingHr: null, hrvMs: null, restingHrSpread: null, hrvSpread: null, restingHrDays: 0, hrvDays: 0, sleepDays: 0, method: 'bootstrap' };
}

function robustStats(values, minimum, floorSpread) {
  if (values.length < minimum) return { median: null, spread: null, days: values.length };
  const sorted = [...values].sort((a, b) => a - b);
  const trimmed = sorted.length >= 9 ? sorted.slice(1, -1) : sorted;
  const median = medianOf(trimmed);
  const deviations = trimmed.map(value => Math.abs(value - median));
  const mad = medianOf(deviations);
  const spread = Math.max(floorSpread, mad * 1.4826);
  return { median: Number(median.toFixed(1)), spread: Number(spread.toFixed(1)), days: values.length };
}

function emptyStats() { return { median: null, spread: null, days: 0 }; }
function medianOf(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function finite(value) { return Number.isFinite(Number(value)); }
