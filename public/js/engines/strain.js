import { addDays, dateRange, localDateKey } from '../core/date.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const sum = values => values.reduce((total, value) => total + (Number(value) || 0), 0);

export function calculateSessionLoad(activity) {
  const duration = Math.max(0, Number(activity.durationMin) || 0);
  const rpe = clamp(Number(activity.rpe) || inferRpe(activity), 1, 10);
  const gain = Math.max(0, Number(activity.elevationGainM) || 0);
  const loss = Math.max(0, Number(activity.elevationLossM) || 0);
  const distance = Math.max(0, Number(activity.distanceKm) || 0);
  const nightFactor = activity.isNight ? 1.08 : 1;
  const terrainFactor = activity.terrain === 'trail' ? 1.08 : 1;

  // Session-RPE is the primary internal-load measure. Vertical and descent are
  // separate mechanical modifiers, not substitutes for physiological load.
  const internalLoad = duration * rpe;
  const climbUnits = gain / 100;
  const descentUnits = loss / 120;
  const distanceUnits = distance;
  const mechanicalLoad = (distanceUnits + climbUnits + descentUnits) * terrainFactor * nightFactor;
  const totalLoad = internalLoad * (1 + Math.min(0.25, mechanicalLoad / 180));

  return {
    internalLoad: Math.round(internalLoad),
    mechanicalLoad: Number(mechanicalLoad.toFixed(1)),
    totalLoad: Math.round(totalLoad),
    strainScore: Math.round(100 * (1 - Math.exp(-totalLoad / 650)))
  };
}

function inferRpe(activity) {
  const avgHr = Number(activity.avgHr) || 0;
  const maxHr = Number(activity.maxHrReference) || Number(activity.maxHr) || 0;
  if (avgHr > 0 && maxHr > 0) {
    const ratio = avgHr / maxHr;
    if (ratio >= 0.9) return 9;
    if (ratio >= 0.84) return 8;
    if (ratio >= 0.78) return 7;
    if (ratio >= 0.72) return 6;
    if (ratio >= 0.65) return 4;
    return 3;
  }
  return 4;
}

export function activitiesForDate(activities, dateKey) {
  return activities.filter(activity => activity.date === dateKey);
}

export function dailyLoad(activities, dateKey) {
  const sessions = activitiesForDate(activities, dateKey);
  const loads = sessions.map(calculateSessionLoad);
  return {
    date: dateKey,
    activities: sessions.length,
    totalLoad: sum(loads.map(item => item.totalLoad)),
    internalLoad: sum(loads.map(item => item.internalLoad)),
    mechanicalLoad: Number(sum(loads.map(item => item.mechanicalLoad)).toFixed(1)),
    strainScore: Math.round(100 * (1 - Math.exp(-sum(loads.map(item => item.totalLoad)) / 650)))
  };
}

export function loadWindow(activities, endDateKey = localDateKey(), days = 7) {
  const series = dateRange(endDateKey, days).map(date => dailyLoad(activities, date));
  return {
    days,
    startDate: series[0]?.date,
    endDate: endDateKey,
    series,
    totalLoad: sum(series.map(day => day.totalLoad)),
    totalMechanicalLoad: Number(sum(series.map(day => day.mechanicalLoad)).toFixed(1)),
    activeDays: series.filter(day => day.totalLoad > 0).length,
    averageDailyLoad: Math.round(sum(series.map(day => day.totalLoad)) / days)
  };
}

export function calculateLoadTrend(activities, endDateKey = localDateKey()) {
  const last7 = loadWindow(activities, endDateKey, 7);
  const previousEnd = addDays(endDateKey, -7);
  const previous7 = loadWindow(activities, previousEnd, 7);
  const last28 = loadWindow(activities, endDateKey, 28);
  const weeklyEquivalent28 = last28.totalLoad / 4;
  const trendRatio = weeklyEquivalent28 > 0 ? last7.totalLoad / weeklyEquivalent28 : null;
  const weekChangePct = previous7.totalLoad > 0
    ? ((last7.totalLoad - previous7.totalLoad) / previous7.totalLoad) * 100
    : null;

  return {
    last7,
    previous7,
    last28,
    trendRatio: trendRatio == null ? null : Number(trendRatio.toFixed(2)),
    weekChangePct: weekChangePct == null ? null : Math.round(weekChangePct),
    warning: classifyTrend(trendRatio, weekChangePct)
  };
}

function classifyTrend(trendRatio, weekChangePct) {
  if (trendRatio == null) return { level: 'info', code: 'insufficient_history' };
  if (trendRatio > 1.5 || (weekChangePct != null && weekChangePct > 35)) {
    return { level: 'high', code: 'rapid_load_increase' };
  }
  if (trendRatio > 1.25 || (weekChangePct != null && weekChangePct > 20)) {
    return { level: 'moderate', code: 'load_increasing' };
  }
  if (trendRatio < 0.65) return { level: 'low', code: 'load_reduced' };
  return { level: 'normal', code: 'load_stable' };
}

export function calculateBehaviorLoad(checkin, history = []) {
  if (!checkin) return { score: null, penalty: 0, confidence: 0, components: [], flags: ['missing_behavior_data'] };
  const prior = history
    .filter(item => item.date && item.date < checkin.date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 28);
  const components = [];
  const flags = [];

  addBehaviorComponent('steps', checkin.steps, median(prior.map(item => Number(item.steps)).filter(value => value > 0)), 10000, 0.45, components, flags);
  addBehaviorComponent('activeEnergyKcal', checkin.activeEnergyKcal, median(prior.map(item => Number(item.activeEnergyKcal)).filter(value => value > 0)), 650, 0.35, components, flags);
  addBehaviorComponent('exerciseMinutes', checkin.exerciseMinutes, median(prior.map(item => Number(item.exerciseMinutes)).filter(value => value > 0)), 45, 0.20, components, flags);

  if (!components.length) return { score: null, penalty: 0, confidence: 0, components, flags: ['missing_behavior_data'] };
  const totalWeight = components.reduce((total, item) => total + item.weight, 0);
  const score = components.reduce((total, item) => total + item.score * item.weight, 0) / totalWeight;
  const penalty = clamp((score - 55) / 5, 0, 10);
  return {
    score: Math.round(score),
    penalty: Math.round(penalty),
    confidence: Math.round(clamp((components.length / 3) * 100, 20, 100)),
    components,
    flags: [...new Set(flags)]
  };
}

function addBehaviorComponent(key, rawValue, baseline, defaultBaseline, weight, components, flags) {
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value < 0) return;
  const reference = baseline || defaultBaseline;
  const ratio = reference > 0 ? value / reference : 1;
  const score = clamp(35 + ratio * 35, 20, 100);
  components.push({ key, value, baseline: reference, ratio: Number(ratio.toFixed(2)), score, weight });
  if (ratio >= 1.5 && value >= defaultBaseline) flags.push(`high_${key}`);
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
