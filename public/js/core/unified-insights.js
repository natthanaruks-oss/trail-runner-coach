const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));

export const UNIFIED_HEALTH_METRICS = Object.freeze([
  { key: 'sleepHours', unit: 'hours', direction: 'higher', precision: 2 },
  { key: 'restingHr', unit: 'bpm', direction: 'lower', precision: 0 },
  { key: 'hrvMs', unit: 'ms', direction: 'higher', precision: 0 },
  { key: 'steps', unit: 'steps', direction: 'neutral', precision: 0 },
  { key: 'activeEnergyKcal', unit: 'kcal', direction: 'neutral', precision: 0 },
  { key: 'walkingRunningDistanceKm', unit: 'km', direction: 'neutral', precision: 2 }
]);

/**
 * Produces one provider-neutral view model for the Today and Health pages.
 * Source metadata remains in storage for audit and diagnostics, but is intentionally
 * excluded from this model so the main experience is organized by athlete outcome.
 */
export function buildUnifiedInsights({ today, health, scoreHistory = [], nutritionBalance = null, nutritionTarget = null } = {}) {
  const metrics = buildMetricModels(health);
  const recoveryScore = finite(today?.recovery?.score) ? Number(today.recovery.score) : null;
  const readinessScore = finite(today?.readiness?.score) ? Number(today.readiness.score) : recoveryScore;
  const loadBalance = buildLoadBalance(today?.loadTrend);
  const energy = buildEnergyScore({ today, health, nutritionBalance, nutritionTarget, recoveryScore });
  const confidence = buildConfidence({ today, health, energy });
  const contributors = buildContributors({ today, metrics, loadBalance, nutritionBalance });
  const coach = buildCoachSummary({ today, readinessScore, recoveryScore, loadBalance, energy, contributors });

  return {
    readiness: {
      score: readinessScore,
      status: today?.readiness?.status || recoveryStatus(recoveryScore),
      confidence,
      labelCode: readinessLabelCode(readinessScore, today?.readiness?.status),
      trend: scoreHistory.map(item => finite(item.readiness) ? Number(item.readiness) : null)
    },
    pillars: {
      recovery: {
        score: recoveryScore,
        status: recoveryStatus(recoveryScore),
        labelCode: recoveryLabelCode(recoveryScore),
        confidence: Number(today?.recovery?.confidence || 0),
        trend: scoreHistory.map(item => finite(item.recovery) ? Number(item.recovery) : null)
      },
      load: {
        ...loadBalance,
        trend: scoreHistory.map(item => finite(item.strain) ? Math.round((Number(item.strain) / 21) * 100) : null),
        todayStrain: finite(today?.strain?.score) ? Number(today.strain.score) : null,
        todayStrainLabel: today?.strain?.classification?.level || 'unknown'
      },
      energy: {
        ...energy,
        trend: buildEnergyTrend(health?.rows || [])
      }
    },
    metrics,
    contributors,
    coach,
    coverage: {
      healthDays: Number(health?.trend?.coverageDays || 0),
      totalDays: Number(health?.trend?.days || 0),
      availableMetrics: metrics.filter(item => item.value != null).length,
      totalMetrics: metrics.length,
      confidence
    },
    lastUpdatedAt: health?.lastImportedAt || null,
    hasData: Boolean(health?.hasData)
  };
}

export function buildMetricModels(health = {}) {
  const rows = Array.isArray(health.rows) ? health.rows : [];
  return UNIFIED_HEALTH_METRICS.map(definition => {
    const value = finite(health?.metrics?.[definition.key]) ? Number(health.metrics[definition.key]) : null;
    const date = health?.metricDates?.[definition.key] || null;
    const sourceDate = health?.sourceMetricDates?.[definition.key] || date;
    const alignment = health?.metricAlignments?.[definition.key] || null;
    const series = rows.map(row => finite(row?.[definition.key]) ? Number(row[definition.key]) : null);
    const priorValues = rows
      .filter(row => row?.date !== sourceDate && finite(row?.[definition.key]))
      .map(row => Number(row[definition.key]));
    const baseline = average(priorValues);
    const delta = value != null && baseline != null ? value - baseline : null;
    return {
      ...definition,
      value,
      date,
      sourceDate,
      alignment,
      baseline: roundOrNull(baseline, definition.precision),
      delta: roundOrNull(delta, definition.precision),
      tone: metricTone(definition.key, delta),
      series
    };
  });
}

export function buildLoadBalance(loadTrend = {}) {
  const ratio = finite(loadTrend?.trendRatio)
    ? Number(loadTrend.trendRatio)
    : null;
  const weekChangePct = finite(loadTrend?.weekChangePct)
    ? Number(loadTrend.weekChangePct)
    : null;
  const totalLoad = Number(loadTrend?.last7?.totalLoad || 0);

  if (ratio == null) {
    return {
      score: totalLoad > 0 ? 65 : null,
      status: totalLoad > 0 ? 'building' : 'unknown',
      labelCode: totalLoad > 0 ? 'building_history' : 'no_load_history',
      ratio,
      weekChangePct
    };
  }

  const positiveChange = Math.max(0, weekChangePct || 0);
  const overloadPenalty = Math.max(0, ratio - 1) * 82;
  const spikePenalty = Math.max(0, positiveChange - 15) * 0.9;
  let score = Math.round(
    clamp(100 - overloadPenalty - spikePenalty, 0, 100)
  );

  const positiveSpike = positiveChange > 35 || ratio > 1.45;
  const risingLoad = positiveChange > 20 || ratio > 1.25;
  const underload =
    (weekChangePct != null && weekChangePct < -35) ||
    ratio < 0.65;

  let status = 'balanced';
  let labelCode = 'load_balanced';

  if (positiveSpike) {
    status = 'risk';
    labelCode = 'load_spike';
  } else if (risingLoad) {
    status = 'watch';
    labelCode = 'load_rising';
  } else if (underload) {
    status = 'underload';
    labelCode = 'load_below_recent';
    score = Math.min(score, 65);
  }

  return {
    score,
    status,
    labelCode,
    ratio,
    weekChangePct
  };
}

export function buildEnergyScore({ today, health, nutritionBalance, nutritionTarget, recoveryScore } = {}) {
  const components = [];
  if (finite(recoveryScore)) components.push({ key: 'recovery', score: Number(recoveryScore), weight: 0.5 });

  const behaviorScore = finite(today?.strain?.behaviorLoad?.score) ? Number(today.strain.behaviorLoad.score) : null;
  if (behaviorScore != null) {
    const movementScore = clamp(92 - Math.max(0, behaviorScore - 55) * 1.25, 25, 96);
    components.push({ key: 'movement', score: movementScore, weight: 0.25 });
  }

  if (nutritionBalance?.foodComplete && finite(nutritionBalance.netKcal)) {
    const deviation = Math.abs(Number(nutritionBalance.netKcal) - (-150));
    const fuelScore = clamp(100 - deviation / 7.5, 20, 100);
    components.push({ key: 'fuel', score: fuelScore, weight: 0.25 });
  } else if (finite(health?.metrics?.activeEnergyKcal) || finite(nutritionTarget?.kcal)) {
    components.push({ key: 'fuel_data', score: 62, weight: 0.12 });
  }

  if (!components.length) return { score: null, status: 'unknown', labelCode: 'energy_unknown', components, confidence: 0 };
  const weightTotal = components.reduce((sum, item) => sum + item.weight, 0);
  const score = Math.round(components.reduce((sum, item) => sum + item.score * item.weight, 0) / weightTotal);
  const status = score >= 75 ? 'good' : score >= 55 ? 'moderate' : 'low';
  return {
    score,
    status,
    labelCode: status === 'good' ? 'energy_good' : status === 'moderate' ? 'energy_moderate' : 'energy_low',
    components,
    confidence: Math.round(clamp((components.length / 3) * 100, 25, 100))
  };
}

function buildConfidence({ today, health, energy }) {
  const objectiveCoverage = ((Number(health?.recoveryAvailable || 0) / 3) * 45) + ((Number(health?.behaviorAvailable || 0) / 3) * 20);
  const readinessConfidence = finite(today?.readiness?.confidence) ? Number(today.readiness.confidence) * 0.25 : 0;
  const energyConfidence = Number(energy?.confidence || 0) * 0.1;
  return Math.round(clamp(objectiveCoverage + readinessConfidence + energyConfidence, 0, 100));
}

function buildContributors({ today, metrics, loadBalance, nutritionBalance }) {
  const byKey = Object.fromEntries(metrics.map(item => [item.key, item]));
  const contributors = [];
  const sleep = byKey.sleepHours;
  if (sleep?.value != null) {
    if (sleep.value < 6) contributors.push({ code: 'short_sleep', tone: 'risk', value: sleep.value, delta: sleep.delta });
    else if (sleep.delta != null && sleep.delta <= -0.5) contributors.push({ code: 'sleep_below_baseline', tone: 'watch', value: sleep.value, delta: sleep.delta });
    else contributors.push({ code: 'sleep_supportive', tone: 'good', value: sleep.value, delta: sleep.delta });
  }
  const rhr = byKey.restingHr;
  if (rhr?.delta != null) {
    if (rhr.delta >= 4) contributors.push({ code: 'rhr_elevated', tone: 'risk', value: rhr.value, delta: rhr.delta });
    else if (rhr.delta <= -2) contributors.push({ code: 'rhr_below_baseline', tone: 'good', value: rhr.value, delta: rhr.delta });
  }
  const hrv = byKey.hrvMs;
  if (hrv?.delta != null) {
    if (hrv.delta <= -8) contributors.push({ code: 'hrv_suppressed', tone: 'risk', value: hrv.value, delta: hrv.delta });
    else if (hrv.delta >= 5) contributors.push({ code: 'hrv_supportive', tone: 'good', value: hrv.value, delta: hrv.delta });
  }
  if (loadBalance?.status === 'risk') {
  contributors.push({
    code: 'load_outside_range',
    tone: 'risk',
    value: loadBalance.weekChangePct
  });
} else if (loadBalance?.status === 'watch') {
  contributors.push({
    code: 'load_changing',
    tone: 'watch',
    value: loadBalance.weekChangePct
  });
} else if (loadBalance?.status === 'underload') {
  contributors.push({
    code: 'load_below_recent',
    tone: 'neutral',
    value: loadBalance.weekChangePct
  });
} else if (loadBalance?.status === 'balanced') {
  contributors.push({
    code: 'load_balanced',
    tone: 'good',
    value: loadBalance.weekChangePct
  });
}

  const pain = today?.readiness?.pain;
  if (pain?.hardStop) contributors.unshift({ code: 'pain_hard_stop', tone: 'risk' });
  else if (pain?.caution) contributors.unshift({ code: 'pain_caution', tone: 'watch' });

  if (nutritionBalance?.foodComplete && finite(nutritionBalance.netKcal) && Number(nutritionBalance.netKcal) < -600) {
    contributors.push({ code: 'large_energy_deficit', tone: 'watch', value: Number(nutritionBalance.netKcal) });
  }
  return contributors.slice(0, 5);
}

function buildCoachSummary({ today, readinessScore, recoveryScore, loadBalance, energy, contributors }) {
  const riskCount = contributors.filter(item => item.tone === 'risk').length;
  const watchCount = contributors.filter(item => item.tone === 'watch').length;
  const hardStop = Boolean(today?.readiness?.pain?.hardStop || today?.readiness?.status === 'red');
  let actionCode = 'follow_plan';
  if (hardStop || (recoveryScore != null && recoveryScore < 40)) actionCode = 'rest_or_recovery';
  else if (riskCount || watchCount >= 2 || loadBalance?.status === 'risk' || (energy?.score != null && energy.score < 50)) actionCode = 'reduce_load';
  else if (readinessScore == null) actionCode = 'check_in_first';
  else if (readinessScore >= 75 && loadBalance?.status === 'balanced') actionCode = 'quality_session_ok';

  return {
    actionCode,
    headlineCode: hardStop ? 'protect_recovery' : riskCount ? 'recovery_under_pressure' : watchCount ? 'manage_load' : 'on_track',
    contributorCodes: contributors.map(item => item.code),
    plannedType: today?.plan?.todaySession?.t || null
  };
}

function buildEnergyTrend(rows) {
  return rows.map(row => {
    const sleep = finite(row?.sleepHours) ? clamp((Number(row.sleepHours) / 8) * 100, 20, 100) : null;
    const active = finite(row?.activeEnergyKcal) ? clamp(95 - Math.max(0, Number(row.activeEnergyKcal) - 650) / 12, 30, 95) : null;
    if (sleep == null && active == null) return null;
    if (sleep == null) return Math.round(active);
    if (active == null) return Math.round(sleep);
    return Math.round(sleep * 0.7 + active * 0.3);
  });
}

function metricTone(key, delta) {
  if (delta == null) return 'neutral';
  if (key === 'sleepHours') return delta >= 0.3 ? 'good' : delta <= -0.5 ? 'risk' : 'neutral';
  if (key === 'restingHr') return delta <= -2 ? 'good' : delta >= 4 ? 'risk' : 'neutral';
  if (key === 'hrvMs') return delta >= 5 ? 'good' : delta <= -8 ? 'risk' : 'neutral';
  return 'neutral';
}

function recoveryStatus(score) {
  if (score == null) return 'unknown';
  return score >= 75 ? 'good' : score >= 50 ? 'moderate' : 'low';
}
function recoveryLabelCode(score) {
  if (score == null) return 'recovery_unknown';
  return score >= 75 ? 'recovery_good' : score >= 50 ? 'recovery_moderate' : 'recovery_low';
}
function readinessLabelCode(score, status) {
  if (score == null) return 'readiness_unknown';
  if (status === 'red') return 'readiness_stop';
  if (status === 'yellow') return 'readiness_reduce';
  return score >= 75 ? 'readiness_good' : score >= 50 ? 'readiness_moderate' : 'readiness_low';
}
function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
function roundOrNull(value, precision = 1) {
  if (!finite(value)) return null;
  const factor = 10 ** precision;
  return Math.round(Number(value) * factor) / factor;
}
