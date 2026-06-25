import { addDays, daysBetween, localDateKey, startOfWeek } from './date.js';
import { flattenPlan } from './plan.js';
import { getActivePlan } from './races.js';
import { energyBalancePeriod } from './nutrition.js';
import { selectScoreHistory } from './selectors.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const average = values => {
  const usable = values.filter(value => value !== null && value !== undefined && Number.isFinite(Number(value))).map(Number);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
};
const round = (value, digits = 0) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
};

export const PROGRESS_PRESETS = Object.freeze({
  7: { days: 7, bucket: 'day' },
  28: { days: 28, bucket: 'week' },
  90: { days: 90, bucket: 'week' }
});

export function normalizeProgressRange({ preset = 28, startDate, endDate } = {}) {
  const safeEnd = validDateKey(endDate) ? endDate : localDateKey();
  const presetDays = Number(preset);
  if (PROGRESS_PRESETS[presetDays]) {
    return {
      preset: presetDays,
      startDate: addDays(safeEnd, -(presetDays - 1)),
      endDate: safeEnd,
      days: presetDays,
      bucket: PROGRESS_PRESETS[presetDays].bucket
    };
  }
  const start = validDateKey(startDate) ? startDate : addDays(safeEnd, -27);
  const [from, to] = start <= safeEnd ? [start, safeEnd] : [safeEnd, start];
  const rawDays = Math.max(1, daysBetween(from, to) + 1);
  const boundedFrom = rawDays > 366 ? addDays(to, -365) : from;
  const days = clamp(daysBetween(boundedFrom, to) + 1, 1, 366);
  return {
    preset: 'custom',
    startDate: boundedFrom,
    endDate: to,
    days,
    bucket: days <= 14 ? 'day' : 'week'
  };
}

export function buildProgressDashboard(state, options = {}) {
  const range = normalizeProgressRange(options);
  const previousEnd = addDays(range.startDate, -1);
  const previousStart = addDays(previousEnd, -(range.days - 1));
  const current = buildPeriod(state, range.startDate, range.endDate, range.bucket);
  const previous = buildPeriod(state, previousStart, previousEnd, range.bucket);
  const comparisons = buildComparisons(current, previous);
  const insights = buildInsights(current, previous, comparisons);
  return {
    range,
    previousRange: { startDate: previousStart, endDate: previousEnd, days: range.days },
    current,
    previous,
    comparisons,
    insights,
    coverage: buildCoverage(current, range.days)
  };
}

function buildPeriod(state, startDate, endDate, bucketMode) {
  const activities = state.activities.filter(item => inRange(item.date, startDate, endDate));
  const footActivities = activities.filter(isFootActivity);
  const plan = buildPlanSummary(state, startDate, endDate, footActivities);
  const scores = selectScoreHistory(state, daysBetween(startDate, endDate) + 1, endDate)
    .filter(item => inRange(item.date, startDate, endDate));
  const pain = buildPainSummary(state.painLogs.filter(item => inRange(item.date, startDate, endDate)), startDate, endDate);
  const energy = energyBalancePeriod(state, startDate, endDate);
  const activity = buildActivitySummary(activities, footActivities);
  const scoreSummary = buildScoreSummary(scores);
  const buckets = buildBuckets({ state, startDate, endDate, bucketMode, scores, activities, footActivities, painLogs: state.painLogs, energyRows: energy.rows });
  return { startDate, endDate, activity, plan, scores: scoreSummary, pain, energy, buckets };
}

function buildActivitySummary(activities, footActivities) {
  const activeDates = new Set(activities.filter(item => activityDuration(item) > 0 || number(item.distanceKm) > 0).map(item => item.date));
  const nightRuns = footActivities.filter(item => item.isNight).length;
  const trailSessions = footActivities.filter(item => String(item.terrain).toLowerCase() === 'trail' || /trail|hike/i.test(`${item.type || ''} ${item.name || ''}`)).length;
  return {
    sessions: activities.length,
    footSessions: footActivities.length,
    activeDays: activeDates.size,
    distanceKm: round(sum(footActivities.map(item => number(item.distanceKm))), 1),
    elevationGainM: Math.round(sum(footActivities.map(item => number(item.elevationGainM)))),
    elevationLossM: Math.round(sum(footActivities.map(item => number(item.elevationLossM)))),
    durationMin: Math.round(sum(activities.map(activityDuration))),
    rpeAverage: round(average(activities.map(item => finiteOrNull(item.rpe))), 1),
    nightRuns,
    trailSessions
  };
}

function buildPlanSummary(state, startDate, endDate, footActivities) {
  const plan = getActivePlan(state);
  if (!plan) return emptyPlanSummary();
  const sessions = flattenPlan(plan).filter(session => inRange(session.date, startDate, endDate));
  const trainable = sessions.filter(session => !['Rest', 'Rehab'].includes(session.t));
  const sessionIds = new Set(sessions.map(session => session.id));
  const workouts = state.workouts.filter(workout => sessionIds.has(workout.planSessionId));
  const completed = workouts.filter(workout => ['completed', 'modified'].includes(workout.status));
  const skipped = workouts.filter(workout => workout.status === 'skipped');
  const plannedDistanceKm = sum(trainable.map(session => number(session.km)));
  const plannedElevationGainM = sum(trainable.map(session => number(session.vert)));
  const actualDistanceKm = sum(footActivities.map(item => number(item.distanceKm)));
  const actualElevationGainM = sum(footActivities.map(item => number(item.elevationGainM)));
  return {
    planId: plan.id,
    planName: plan.name || plan.id,
    plannedSessions: trainable.length,
    completedSessions: completed.length,
    modifiedSessions: completed.filter(item => item.status === 'modified').length,
    skippedSessions: skipped.length,
    unloggedSessions: Math.max(0, trainable.length - completed.length - skipped.length),
    adherencePct: trainable.length ? Math.round(completed.length / trainable.length * 100) : null,
    plannedDistanceKm: round(plannedDistanceKm, 1),
    actualDistanceKm: round(actualDistanceKm, 1),
    distanceAchievementPct: plannedDistanceKm > 0 ? Math.round(actualDistanceKm / plannedDistanceKm * 100) : null,
    plannedElevationGainM: Math.round(plannedElevationGainM),
    actualElevationGainM: Math.round(actualElevationGainM),
    verticalAchievementPct: plannedElevationGainM > 0 ? Math.round(actualElevationGainM / plannedElevationGainM * 100) : null
  };
}

function emptyPlanSummary() {
  return {
    planId: null,
    planName: null,
    plannedSessions: 0,
    completedSessions: 0,
    modifiedSessions: 0,
    skippedSessions: 0,
    unloggedSessions: 0,
    adherencePct: null,
    plannedDistanceKm: 0,
    actualDistanceKm: 0,
    distanceAchievementPct: null,
    plannedElevationGainM: 0,
    actualElevationGainM: 0,
    verticalAchievementPct: null
  };
}

function buildScoreSummary(series) {
  const recoveryValues = series.map(item => item.recovery).filter(value => value != null);
  const readinessValues = series.map(item => item.readiness).filter(value => value != null);
  const strainValues = series.map(item => item.strain).filter(value => value != null);
  const statusDays = series.reduce((acc, item) => {
    if (item.status && item.status !== 'unknown') acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, { green: 0, yellow: 0, red: 0 });
  return {
    series,
    averageStrain: round(average(strainValues), 1),
    peakStrain: strainValues.length ? round(Math.max(...strainValues), 1) : null,
    averageRecovery: round(average(recoveryValues), 0),
    averageReadiness: round(average(readinessValues), 0),
    recoveryDays: recoveryValues.length,
    readinessDays: readinessValues.length,
    strainDays: strainValues.filter(value => value > 0).length,
    statusDays
  };
}

function buildPainSummary(logs, startDate, endDate) {
  const sorted = [...logs].sort((a, b) => `${a.date}:${a.createdAt || ''}`.localeCompare(`${b.date}:${b.createdAt || ''}`));
  const severities = sorted.map(item => number(item.severity));
  const dates = new Set(sorted.filter(item => number(item.severity) > 0).map(item => item.date));
  const byArea = new Map();
  for (const log of sorted) {
    const row = byArea.get(log.area) || { area: log.area, count: 0, maxSeverity: 0, totalSeverity: 0, worsening: 0 };
    row.count += 1;
    row.maxSeverity = Math.max(row.maxSeverity, number(log.severity));
    row.totalSeverity += number(log.severity);
    if (log.trend === 'worse') row.worsening += 1;
    byArea.set(log.area, row);
  }
  const areas = [...byArea.values()].map(item => ({ ...item, averageSeverity: round(item.totalSeverity / item.count, 1) }))
    .sort((a, b) => b.maxSeverity - a.maxSeverity || b.count - a.count);
  const midpoint = addDays(startDate, Math.floor(daysBetween(startDate, endDate) / 2));
  const firstHalf = sorted.filter(item => item.date <= midpoint).map(item => number(item.severity));
  const secondHalf = sorted.filter(item => item.date > midpoint).map(item => number(item.severity));
  const firstAverage = average(firstHalf);
  const secondAverage = average(secondHalf);
  return {
    entries: sorted.length,
    painDays: dates.size,
    maxSeverity: severities.length ? Math.max(...severities) : 0,
    averageSeverity: round(average(severities), 1),
    worseningEntries: sorted.filter(item => item.trend === 'worse').length,
    hardStopEntries: sorted.filter(item => number(item.severity) >= 6 || item.during === 'walking').length,
    worstArea: areas[0] || null,
    areas,
    trendDelta: firstAverage != null && secondAverage != null ? round(secondAverage - firstAverage, 1) : null
  };
}

function buildBuckets({ state, startDate, endDate, bucketMode, scores, activities, footActivities, painLogs, energyRows }) {
  const scoreByDate = new Map(scores.map(item => [item.date, item]));
  const energyByDate = new Map(energyRows.map(item => [item.date, item]));
  const groups = new Map();
  for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
    const key = bucketMode === 'day' ? date : startOfWeek(date, 1);
    if (!groups.has(key)) groups.set(key, { key, startDate: date, endDate: date, dates: [] });
    const group = groups.get(key);
    group.startDate = group.startDate < date ? group.startDate : date;
    group.endDate = group.endDate > date ? group.endDate : date;
    group.dates.push(date);
  }
  const plan = getActivePlan(state);
  const sessions = plan ? flattenPlan(plan).filter(session => inRange(session.date, startDate, endDate)) : [];
  const workoutBySession = new Map(state.workouts.map(item => [item.planSessionId, item]));
  return [...groups.values()].map(group => {
    const bucketActivities = activities.filter(item => group.dates.includes(item.date));
    const bucketFoot = footActivities.filter(item => group.dates.includes(item.date));
    const bucketScores = group.dates.map(date => scoreByDate.get(date)).filter(Boolean);
    const bucketPain = painLogs.filter(item => group.dates.includes(item.date));
    const bucketEnergy = group.dates.map(date => energyByDate.get(date)).filter(Boolean).filter(item => item.foodComplete);
    const bucketSessions = sessions.filter(item => group.dates.includes(item.date) && !['Rest', 'Rehab'].includes(item.t));
    const bucketWorkouts = bucketSessions.map(item => workoutBySession.get(item.id)).filter(Boolean);
    return {
      key: group.key,
      startDate: group.startDate,
      endDate: group.endDate,
      days: group.dates.length,
      distanceKm: round(sum(bucketFoot.map(item => number(item.distanceKm))), 1),
      elevationGainM: Math.round(sum(bucketFoot.map(item => number(item.elevationGainM)))),
      durationMin: Math.round(sum(bucketActivities.map(activityDuration))),
      plannedDistanceKm: round(sum(bucketSessions.map(item => number(item.km))), 1),
      plannedElevationGainM: Math.round(sum(bucketSessions.map(item => number(item.vert)))),
      completedSessions: bucketWorkouts.filter(item => ['completed', 'modified'].includes(item.status)).length,
      plannedSessions: bucketSessions.length,
      strain: round(average(bucketScores.map(item => item.strain)), 1),
      recovery: round(average(bucketScores.map(item => item.recovery)), 0),
      readiness: round(average(bucketScores.map(item => item.readiness)), 0),
      painMax: bucketPain.length ? Math.max(...bucketPain.map(item => number(item.severity))) : 0,
      netEnergyKcal: bucketEnergy.length ? Math.round(sum(bucketEnergy.map(item => number(item.netKcal)))) : null,
      foodCompleteDays: bucketEnergy.length
    };
  });
}

function buildComparisons(current, previous) {
  return {
    distanceKm: compareMetric(current.activity.distanceKm, previous.activity.distanceKm),
    elevationGainM: compareMetric(current.activity.elevationGainM, previous.activity.elevationGainM),
    durationMin: compareMetric(current.activity.durationMin, previous.activity.durationMin),
    sessions: compareMetric(current.activity.sessions, previous.activity.sessions),
    adherencePct: compareMetric(current.plan.adherencePct, previous.plan.adherencePct, true),
    averageStrain: compareMetric(current.scores.averageStrain, previous.scores.averageStrain),
    averageRecovery: compareMetric(current.scores.averageRecovery, previous.scores.averageRecovery, true),
    averageReadiness: compareMetric(current.scores.averageReadiness, previous.scores.averageReadiness, true),
    maxPain: compareMetric(current.pain.maxSeverity, previous.pain.maxSeverity, true),
    netEnergyKcal: compareMetric(current.energy.netKcal, previous.energy.netKcal, true)
  };
}

function compareMetric(current, previous, absoluteDelta = false) {
  if (current == null || previous == null) return { current, previous, delta: null, pct: null };
  const delta = Number(current) - Number(previous);
  const pct = Number(previous) !== 0 ? delta / Math.abs(Number(previous)) * 100 : null;
  return {
    current,
    previous,
    delta: round(delta, absoluteDelta ? 0 : 1),
    pct: pct == null ? null : Math.round(pct)
  };
}

function buildCoverage(period, days) {
  const healthDays = Math.max(period.scores.recoveryDays, period.scores.readinessDays);
  return {
    activityDays: period.activity.activeDays,
    healthDays,
    foodDays: period.energy.completeDays,
    painEntries: period.pain.entries,
    activityPct: Math.round(period.activity.activeDays / Math.max(1, days) * 100),
    healthPct: Math.round(healthDays / Math.max(1, days) * 100),
    foodPct: period.energy.coveragePct,
    confidence: Math.round(clamp((Math.min(100, healthDays / Math.min(days, 21) * 100) * 0.45) + (Math.min(100, period.activity.activeDays / Math.min(days, 7) * 100) * 0.35) + (period.energy.coveragePct * 0.20), 0, 100))
  };
}

function buildInsights(current, previous, comparisons) {
  const insights = [];
  if (current.plan.adherencePct != null) {
    insights.push({
      code: current.plan.adherencePct >= 80 ? 'adherence_on_track' : current.plan.adherencePct >= 60 ? 'adherence_watch' : 'adherence_low',
      tone: current.plan.adherencePct >= 80 ? 'good' : current.plan.adherencePct >= 60 ? 'watch' : 'risk',
      value: current.plan.adherencePct,
      planned: current.plan.plannedSessions,
      completed: current.plan.completedSessions
    });
  }
  if (comparisons.distanceKm.pct != null && Math.abs(comparisons.distanceKm.pct) >= 10) {
    insights.push({ code: comparisons.distanceKm.pct > 0 ? 'distance_up' : 'distance_down', tone: comparisons.distanceKm.pct > 35 ? 'watch' : 'neutral', value: comparisons.distanceKm.pct });
  }
  if (current.scores.averageRecovery != null) {
    insights.push({
      code: current.scores.averageRecovery >= 75 ? 'recovery_good' : current.scores.averageRecovery >= 50 ? 'recovery_mixed' : 'recovery_low',
      tone: current.scores.averageRecovery >= 75 ? 'good' : current.scores.averageRecovery >= 50 ? 'watch' : 'risk',
      value: current.scores.averageRecovery
    });
  }
  if (current.pain.maxSeverity >= 6 || current.pain.hardStopEntries > 0) {
    insights.push({ code: 'pain_hard_stop', tone: 'risk', value: current.pain.maxSeverity, area: current.pain.worstArea?.area });
  } else if (current.pain.trendDelta != null && current.pain.trendDelta >= 1) {
    insights.push({ code: 'pain_worsening', tone: 'watch', value: current.pain.trendDelta, area: current.pain.worstArea?.area });
  } else if (current.pain.entries && current.pain.trendDelta != null && current.pain.trendDelta <= -1) {
    insights.push({ code: 'pain_improving', tone: 'good', value: current.pain.trendDelta, area: current.pain.worstArea?.area });
  }
  if (current.energy.completeDays >= 3) {
    if (current.energy.averageNetKcal != null && current.energy.averageNetKcal < -500) insights.push({ code: 'energy_deficit_high', tone: 'risk', value: current.energy.averageNetKcal, days: current.energy.completeDays });
    else if (current.energy.averageNetKcal != null && current.energy.averageNetKcal < -250) insights.push({ code: 'energy_deficit_watch', tone: 'watch', value: current.energy.averageNetKcal, days: current.energy.completeDays });
    else insights.push({ code: 'energy_balanced', tone: 'good', value: current.energy.averageNetKcal, days: current.energy.completeDays });
  }
  if (!insights.length) insights.push({ code: 'insufficient_data', tone: 'neutral' });
  return insights.slice(0, 6);
}

export function isFootActivity(activity = {}) {
  const haystack = `${activity.type || ''} ${activity.name || ''} ${activity.sportType || ''}`.toLowerCase();
  if (/bike|cycling|swim|row|elliptical/.test(haystack)) return false;
  if (/run|trail|walk|hike|treadmill/.test(haystack)) return true;
  return number(activity.distanceKm) > 0 && String(activity.terrain || '').toLowerCase() !== 'strength';
}

function activityDuration(item) {
  return number(item.durationMin || item.elapsedTimeMin || item.movingTimeMin);
}
function inRange(date, startDate, endDate) { return validDateKey(date) && date >= startDate && date <= endDate; }
function validDateKey(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')); }
function finiteOrNull(value) { const numeric = Number(value); return value === '' || value == null || !Number.isFinite(numeric) ? null : numeric; }
function sum(values) { return values.reduce((total, value) => total + (Number(value) || 0), 0); }
