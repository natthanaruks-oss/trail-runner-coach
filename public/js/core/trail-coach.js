import { addDays, daysBetween, localDateKey } from './date.js';
import { calculateSessionLoad } from '../engines/strain.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const round = (value, digits = 0) => {
  if (!finite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
};
const sum = values => values.reduce((total, value) => total + (Number(value) || 0), 0);
const average = values => values.length ? sum(values) / values.length : null;

const HARD_SESSION_TYPES = new Set(['Hill', 'Tempo', 'Long', 'B2B', 'Night', 'Race', 'Intervals', 'Interval']);
const LONG_SESSION_TYPES = new Set(['Long', 'B2B', 'Night', 'Race']);

/**
 * Builds one provider-neutral trail coaching model. It never invents a missing
 * physiological value and it keeps pain/symptom safety gates above performance advice.
 */
export function buildTrailCoachIntelligence({
  state = {},
  today = {},
  unified = {},
  personalTrends = {},
  week = {},
  countdown = {},
  endDateKey = localDateKey()
} = {}) {
  const activities = Array.isArray(state.activities) ? state.activities : [];
  const progression = buildWeeklyTrailProgression(activities, endDateKey, 6);
  const elevationLoad = buildElevationAwareLoad(activities, endDateKey, 7, progression);
  const longRun = buildLongRunReadiness({
    activities,
    endDateKey,
    plannedSession: today?.plan?.todaySession,
    recoveryScore: unified?.pillars?.recovery?.score,
    loadStatus: unified?.pillars?.load?.status,
    form: personalTrends?.load?.form,
    pain: today?.readiness?.pain,
    healthConfidence: unified?.coverage?.confidence
  });
  const race = buildRaceReadiness({
    race: countdown?.race || today?.race,
    countdownDays: countdown?.days,
    week,
    progression,
    longRun,
    recoveryScore: unified?.pillars?.recovery?.score,
    loadStatus: unified?.pillars?.load?.status,
    form: personalTrends?.load?.form,
    healthConfidence: unified?.coverage?.confidence,
    planPhase: today?.plan?.week?.phase
  });
  const freshness = buildFreshness(unified?.metrics || [], endDateKey);
  const prescription = buildDailyTrainingPrescription({
    plannedSession: today?.plan?.todaySession,
    readiness: unified?.readiness,
    recovery: unified?.pillars?.recovery,
    load: unified?.pillars?.load,
    energy: unified?.pillars?.energy,
    pain: today?.readiness?.pain,
    checkinComplete: Boolean(today?.checkin),
    longRun,
    race,
    elevationLoad,
    freshness
  });
  const confidence = Math.round(clamp(average([
    finite(unified?.coverage?.confidence) ? Number(unified.coverage.confidence) : null,
    progression.confidence,
    longRun.confidence,
    race.confidence
  ].filter(finite)) ?? 0, 0, 100));

  return {
    prescription,
    race,
    longRun,
    elevationLoad,
    progression,
    freshness,
    confidence,
    disclaimerCode: 'training_guidance_not_medical',
    hasData: progression.activeWeeks > 0 || Boolean(unified?.hasData),
    methodology: {
      raceReadiness: 'weighted_volume_vertical_long_run_recovery_consistency',
      longRunReadiness: 'recent_endurance_recovery_form_pain',
      elevationLoad: 'session_rpe_plus_trail_mechanical_load'
    }
  };
}

export function buildWeeklyTrailProgression(activities = [], endDateKey = localDateKey(), weeks = 6) {
  const safeWeeks = clamp(Math.round(Number(weeks) || 6), 2, 12);
  const foot = activities.filter(isFootActivity);
  const buckets = [];
  for (let offset = safeWeeks - 1; offset >= 0; offset -= 1) {
    const endDate = addDays(endDateKey, -(offset * 7));
    const startDate = addDays(endDate, -6);
    const rows = foot.filter(item => item.date >= startDate && item.date <= endDate);
    const sessionLoads = rows.map(calculateSessionLoad);
    const distanceKm = sum(rows.map(item => item.distanceKm));
    const elevationGainM = sum(rows.map(item => item.elevationGainM));
    const durationMin = sum(rows.map(activityDuration));
    buckets.push({
      startDate,
      endDate,
      sessions: rows.length,
      activeDays: new Set(rows.map(item => item.date)).size,
      distanceKm: round(distanceKm, 1),
      elevationGainM: Math.round(elevationGainM),
      durationMin: Math.round(durationMin),
      totalLoad: Math.round(sum(sessionLoads.map(item => item.totalLoad))),
      mechanicalLoad: round(sum(sessionLoads.map(item => item.mechanicalLoad)), 1),
      longestDistanceKm: round(Math.max(0, ...rows.map(item => Number(item.distanceKm) || 0)), 1),
      longestDurationMin: Math.round(Math.max(0, ...rows.map(activityDuration))),
      climbDensityMPerKm: distanceKm > 0 ? Math.round(elevationGainM / distanceKm) : 0,
      trailEquivalentKm: round(distanceKm + elevationGainM / 100, 1)
    });
  }
  const current = buckets.at(-1) || emptyWeek();
  const previous = buckets.at(-2) || emptyWeek();
  const distanceChangePct = percentChange(current.distanceKm, previous.distanceKm);
  const verticalChangePct = percentChange(current.elevationGainM, previous.elevationGainM);
  const loadChangePct = percentChange(current.totalLoad, previous.totalLoad);
  const activeWeeks = buckets.filter(item => item.sessions > 0).length;
  const largestPositiveRamp = Math.max(0, distanceChangePct || 0, verticalChangePct || 0, loadChangePct || 0);
  const status = activeWeeks < 3 ? 'building_history' : largestPositiveRamp > 35 ? 'spike' : largestPositiveRamp > 20 ? 'watch' : 'stable';
  const confidence = Math.round(clamp((activeWeeks / safeWeeks) * 75 + Math.min(25, sum(buckets.map(item => item.sessions)) * 2), 0, 100));

  return {
    weeks: safeWeeks,
    buckets,
    current,
    previous,
    activeWeeks,
    distanceChangePct,
    verticalChangePct,
    loadChangePct,
    status,
    confidence
  };
}

export function buildElevationAwareLoad(activities = [], endDateKey = localDateKey(), days = 7, progression = null) {
  const startDate = addDays(endDateKey, -(Math.max(1, Number(days) || 7) - 1));
  const rows = activities.filter(item => isFootActivity(item) && item.date >= startDate && item.date <= endDateKey);
  const loads = rows.map(calculateSessionLoad);
  const distanceKm = sum(rows.map(item => item.distanceKm));
  const elevationGainM = sum(rows.map(item => item.elevationGainM));
  const elevationLossM = sum(rows.map(item => item.elevationLossM));
  const durationMin = sum(rows.map(activityDuration));
  const totalLoad = sum(loads.map(item => item.totalLoad));
  const mechanicalLoad = sum(loads.map(item => item.mechanicalLoad));
  const climbDensityMPerKm = distanceKm > 0 ? elevationGainM / distanceKm : 0;
  const verticalChangePct = progression?.verticalChangePct ?? null;
  const status = !rows.length ? 'no_data'
    : verticalChangePct != null && verticalChangePct > 35 ? 'spike'
      : verticalChangePct != null && verticalChangePct > 20 ? 'watch'
        : climbDensityMPerKm >= 90 ? 'mountain_specific' : 'general';

  return {
    days: Number(days) || 7,
    startDate,
    endDate: endDateKey,
    sessions: rows.length,
    activeDays: new Set(rows.map(item => item.date)).size,
    distanceKm: round(distanceKm, 1),
    elevationGainM: Math.round(elevationGainM),
    elevationLossM: Math.round(elevationLossM),
    durationMin: Math.round(durationMin),
    totalLoad: Math.round(totalLoad),
    mechanicalLoad: round(mechanicalLoad, 1),
    mechanicalSharePct: totalLoad > 0 ? Math.round((mechanicalLoad / totalLoad) * 100) : 0,
    climbDensityMPerKm: Math.round(climbDensityMPerKm),
    trailEquivalentKm: round(distanceKm + elevationGainM / 100, 1),
    verticalChangePct,
    status
  };
}

export function buildLongRunReadiness({
  activities = [],
  endDateKey = localDateKey(),
  plannedSession = null,
  recoveryScore = null,
  loadStatus = 'unknown',
  form = null,
  pain = null,
  healthConfidence = 0
} = {}) {
  const startDate = addDays(endDateKey, -27);
  const rows = activities.filter(item => isFootActivity(item) && item.date >= startDate && item.date <= endDateKey);
  const longSessions = rows.filter(item => activityDuration(item) >= 90 || Number(item.distanceKm) >= 14);
  const longestDurationMin = Math.round(Math.max(0, ...rows.map(activityDuration)));
  const longestDistanceKm = round(Math.max(0, ...rows.map(item => Number(item.distanceKm) || 0)), 1);
  const longestElevationGainM = Math.round(Math.max(0, ...rows.map(item => Number(item.elevationGainM) || 0)));
  const plannedLong = LONG_SESSION_TYPES.has(sessionType(plannedSession));
  const targetDurationMin = plannedLong
    ? Math.max(90, Number(plannedSession?.durationMin) || Number(plannedSession?.minutes) || (Number(plannedSession?.km) || 0) * 8)
    : 150;
  const enduranceScore = clamp((longestDurationMin / Math.max(90, targetDurationMin)) * 100, 0, 100);
  const recoveryComponent = finite(recoveryScore) ? Number(recoveryScore) : 50;
  const formComponent = formScore(form);
  const loadComponent = loadStatus === 'balanced' ? 85 : loadStatus === 'watch' || loadStatus === 'building' ? 62 : loadStatus === 'risk' ? 35 : 50;
  let score = Math.round(enduranceScore * 0.35 + recoveryComponent * 0.35 + formComponent * 0.15 + loadComponent * 0.15);
  if (pain?.hardStop) score = Math.min(score, 10);
  else if (pain?.caution) score = Math.min(score, 55);
  const confidence = Math.round(clamp(
    Math.min(45, longSessions.length * 12 + rows.length * 2) +
    (finite(recoveryScore) ? 20 : 0) +
    (finite(form) ? 15 : 0) +
    Math.min(20, Number(healthConfidence || 0) * 0.2),
    0,
    100
  ));
  const status = pain?.hardStop ? 'stop'
    : score >= 80 ? 'ready'
      : score >= 60 ? 'moderate'
        : score >= 40 ? 'limited' : 'not_ready';

  return {
    score,
    status,
    confidence,
    observedDays: 28,
    sessions: rows.length,
    longSessionCount: longSessions.length,
    longestDurationMin,
    longestDistanceKm,
    longestElevationGainM,
    targetDurationMin: Math.round(targetDurationMin),
    components: {
      endurance: Math.round(enduranceScore),
      recovery: Math.round(recoveryComponent),
      form: Math.round(formComponent),
      loadBalance: Math.round(loadComponent)
    }
  };
}

export function buildRaceReadiness({
  race = null,
  countdownDays = null,
  week = {},
  progression = {},
  longRun = {},
  recoveryScore = null,
  loadStatus = 'unknown',
  form = null,
  healthConfidence = 0,
  planPhase = null
} = {}) {
  if (!race) {
    return {
      score: null,
      status: 'no_race',
      confidence: 0,
      countdownDays: null,
      components: {},
      gaps: ['race_missing'],
      phase: planPhase || null
    };
  }

  const recent = (progression?.buckets || []).slice(-4).filter(item => item.sessions > 0);
  const averageDistance = average(recent.map(item => item.distanceKm)) || 0;
  const averageVertical = average(recent.map(item => item.elevationGainM)) || 0;
  const averageActiveDays = average(recent.map(item => item.activeDays)) || 0;
  const raceDistance = Math.max(1, Number(race.distanceKm) || 0);
  const raceVertical = Math.max(1, Number(race.elevationGainM) || 0);
  const volumeTarget = raceDistance * 0.65;
  const verticalTarget = raceVertical * 0.35;
  const volumeScore = clamp((averageDistance / Math.max(15, volumeTarget)) * 100, 0, 100);
  const verticalScore = clamp((averageVertical / Math.max(500, verticalTarget)) * 100, 0, 100);
  const consistencyScore = clamp((Number(week?.completionPct) || averageActiveDays * 20), 0, 100);
  const enduranceScore = finite(longRun?.score) ? Number(longRun.score) : 40;
  const recoveryComponent = finite(recoveryScore) ? Number(recoveryScore) : 50;
  const loadComponent = loadStatus === 'balanced' ? 88 : loadStatus === 'watch' || loadStatus === 'building' ? 65 : loadStatus === 'risk' ? 35 : 50;
  const specificityScore = buildSpecificityScore(race, recent);
  const days = finite(countdownDays) ? Number(countdownDays) : Math.max(0, daysBetween(localDateKey(), race.date));
  const stage = raceStage(days);
  const rawScore = volumeScore * 0.20 + verticalScore * 0.20 + enduranceScore * 0.20 + consistencyScore * 0.15 + recoveryComponent * 0.10 + loadComponent * 0.10 + specificityScore * 0.05;
  const stageAdjustment = stage === 'foundation' ? 6 : stage === 'taper' && loadStatus === 'balanced' ? 4 : 0;
  const score = Math.round(clamp(rawScore + stageAdjustment, 0, 100));
  const activeWeeks = Number(progression?.activeWeeks || 0);
  const confidence = Math.round(clamp(
    (activeWeeks / Math.max(1, Number(progression?.weeks || 6))) * 45 +
    Math.min(20, Number(longRun?.confidence || 0) * 0.2) +
    Math.min(20, Number(healthConfidence || 0) * 0.2) +
    (race.distanceKm && race.elevationGainM && race.date ? 15 : 5),
    0,
    100
  ));
  const status = confidence < 35 ? 'insufficient'
    : stage === 'foundation' && score >= 45 ? 'building'
      : score >= 80 ? 'on_track'
        : score >= 60 ? 'building'
          : 'watch';
  const gaps = [];
  if (volumeScore < 60) gaps.push('weekly_volume');
  if (verticalScore < 60) gaps.push('vertical_specificity');
  if (enduranceScore < 60) gaps.push('long_run_endurance');
  if (consistencyScore < 65) gaps.push('plan_consistency');
  if (recoveryComponent < 50) gaps.push('recovery');
  if (loadStatus === 'risk') gaps.push('load_spike');

  return {
    score,
    status,
    confidence,
    countdownDays: days,
    stage,
    phase: planPhase || null,
    recentWeeks: recent.length,
    components: {
      weeklyVolume: Math.round(volumeScore),
      verticalSpecificity: Math.round(verticalScore),
      longRunEndurance: Math.round(enduranceScore),
      consistency: Math.round(consistencyScore),
      recovery: Math.round(recoveryComponent),
      loadBalance: Math.round(loadComponent),
      terrainSpecificity: Math.round(specificityScore)
    },
    observations: {
      averageWeeklyDistanceKm: round(averageDistance, 1),
      targetWeeklyDistanceKm: round(volumeTarget, 1),
      averageWeeklyVerticalM: Math.round(averageVertical),
      targetWeeklyVerticalM: Math.round(verticalTarget)
    },
    gaps,
    form: finite(form) ? round(form, 1) : null
  };
}

export function buildDailyTrainingPrescription({
  plannedSession = null,
  readiness = {},
  recovery = {},
  load = {},
  energy = {},
  pain = null,
  checkinComplete = false,
  longRun = {},
  race = {},
  elevationLoad = {},
  freshness = {}
} = {}) {
  const type = sessionType(plannedSession);
  const isHard = HARD_SESSION_TYPES.has(type);
  const isLong = LONG_SESSION_TYPES.has(type);
  const reasons = [];
  const missing = [];
  const readinessScore = finite(readiness?.score) ? Number(readiness.score) : null;
  const recoveryScore = finite(recovery?.score) ? Number(recovery.score) : null;
  const energyScore = finite(energy?.score) ? Number(energy.score) : null;
  const loadChangePct = finite(load?.weekChangePct) ? Number(load.weekChangePct) : null; const loadRisk = load?.status === 'risk' && (loadChangePct == null || loadChangePct > 20);

  if (!checkinComplete) missing.push('subjective_checkin');
  if (readinessScore == null) missing.push('readiness');
  if (recoveryScore == null) missing.push('recovery');
  if (freshness?.staleRecoveryMetrics) missing.push('fresh_recovery_metrics');

  let actionCode = 'follow_plan';
  let distanceFactor = 1;
  let verticalFactor = 1;
  let intensityCode = isHard ? 'planned_quality' : 'easy_controlled';

  if (pain?.hardStop) {
    actionCode = 'rest_assess';
    distanceFactor = 0;
    verticalFactor = 0;
    intensityCode = 'rest_only';
    reasons.push({ code: 'pain_hard_stop', tone: 'risk' });
  } else if (!checkinComplete && isHard) {
    actionCode = 'check_in_first';
    distanceFactor = 0.75;
    verticalFactor = 0.65;
    intensityCode = 'easy_until_checkin';
    reasons.push({ code: 'subjective_data_missing', tone: 'watch' });
  } else if ((readinessScore != null && readinessScore < 40) || (recoveryScore != null && recoveryScore < 40)) {
    actionCode = 'replace_easy_or_rest';
    distanceFactor = isHard ? 0.35 : 0.55;
    verticalFactor = isHard ? 0.20 : 0.45;
    intensityCode = 'recovery_only';
    reasons.push({ code: 'recovery_low', tone: 'risk', value: recoveryScore });
  } else if (pain?.caution || loadRisk || (readinessScore != null && readinessScore < 60)) {
    actionCode = isHard ? 'replace_with_easy' : 'reduce_25';
    distanceFactor = isHard ? 0.55 : 0.75;
    verticalFactor = isHard ? 0.40 : 0.65;
    intensityCode = 'easy_aerobic';
    if (pain?.caution) reasons.push({ code: 'pain_caution', tone: 'watch' });
    if (loadRisk) reasons.push({ code: 'load_risk', tone: 'risk', value: loadChangePct });
    if (readinessScore != null && readinessScore < 60) reasons.push({ code: 'readiness_moderate', tone: 'watch', value: readinessScore });
  } else if ((recoveryScore != null && recoveryScore < 70) || (energyScore != null && energyScore < 55) || elevationLoad?.status === 'spike') {
    actionCode = 'reduce_15';
    distanceFactor = 0.85;
    verticalFactor = elevationLoad?.status === 'spike' ? 0.65 : 0.80;
    intensityCode = isHard ? 'controlled_quality' : 'easy_controlled';
    if (recoveryScore != null && recoveryScore < 70) reasons.push({ code: 'recovery_not_full', tone: 'watch', value: recoveryScore });
    if (energyScore != null && energyScore < 55) reasons.push({ code: 'energy_low', tone: 'watch', value: energyScore });
    if (elevationLoad?.status === 'spike') reasons.push({ code: 'vertical_spike', tone: 'watch', value: elevationLoad.verticalChangePct });
  } else {
    reasons.push({ code: 'signals_support_plan', tone: 'good' });
    if (isLong && longRun?.score < 60) {
      actionCode = 'cap_long_run';
      distanceFactor = 0.8;
      verticalFactor = 0.75;
      intensityCode = 'easy_endurance';
      reasons.unshift({ code: 'long_run_readiness_limited', tone: 'watch', value: longRun.score });
    }
  }

  if (race?.stage === 'taper' && race.countdownDays <= 14 && actionCode === 'follow_plan' && isHard) {
    actionCode = 'taper_quality';
    distanceFactor = Math.min(distanceFactor, 0.75);
    verticalFactor = Math.min(verticalFactor, 0.70);
    intensityCode = 'short_quality_no_extra';
    reasons.unshift({ code: 'taper_window', tone: 'neutral', value: race.countdownDays });
  }

  const plannedDistanceKm = Number(plannedSession?.km) || 0;
  const plannedVerticalM = Number(plannedSession?.vert) || 0;
  const confidenceInputs = [readiness?.confidence, recovery?.confidence, longRun?.confidence, race?.confidence].filter(finite).map(Number);
  let confidence = average(confidenceInputs) ?? 0;
  confidence -= missing.length * 8;
  if (freshness?.staleRecoveryMetrics) confidence -= 12;
  confidence = Math.round(clamp(confidence, 0, 100));

  return {
    actionCode,
    intensityCode,
    plannedType: type,
    suggestedType: suggestedSessionType(actionCode, type),
    distanceFactor: round(distanceFactor, 2),
    verticalFactor: round(verticalFactor, 2),
    suggestedDistanceKm: plannedDistanceKm > 0 ? round(plannedDistanceKm * distanceFactor, 1) : null,
    suggestedVerticalM: plannedVerticalM > 0 ? Math.round(plannedVerticalM * verticalFactor) : null,
    confidence,
    reasons: reasons.slice(0, 5),
    missing,
    hardStop: Boolean(pain?.hardStop),
    safeToEscalate: !pain?.hardStop && confidence >= 55 && !loadRisk && readinessScore >= 70
  };
}

function buildFreshness(metrics, endDateKey) {
  const recoveryKeys = new Set(['sleepHours', 'restingHr', 'hrvMs']);
  const recoveryMetrics = metrics.filter(item => recoveryKeys.has(item.key));
  const ages = recoveryMetrics.map(item => item.date ? daysBetween(item.date, endDateKey) : null).filter(finite);
  const stale = recoveryMetrics.filter(item => !item.date || daysBetween(item.date, endDateKey) > 2).map(item => item.key);
  return {
    recoveryMetricAges: Object.fromEntries(recoveryMetrics.map(item => [item.key, item.date ? daysBetween(item.date, endDateKey) : null])),
    oldestRecoveryAgeDays: ages.length ? Math.max(...ages) : null,
    staleMetrics: stale,
    staleRecoveryMetrics: stale.length >= 2
  };
}

function buildSpecificityScore(race, recentWeeks) {
  if (!recentWeeks.length) return 20;
  const averageClimbDensity = average(recentWeeks.map(item => item.climbDensityMPerKm)) || 0;
  const raceDensity = Number(race.elevationGainM || 0) / Math.max(1, Number(race.distanceKm || 0));
  const terrainScore = raceDensity > 0 ? clamp((averageClimbDensity / raceDensity) * 100, 0, 100) : 65;
  const activeDays = average(recentWeeks.map(item => item.activeDays)) || 0;
  const frequencyScore = clamp((activeDays / 4) * 100, 0, 100);
  return terrainScore * 0.7 + frequencyScore * 0.3;
}

function raceStage(days) {
  if (!finite(days)) return 'unknown';
  if (days <= 14) return 'taper';
  if (days <= 42) return 'specific';
  if (days <= 84) return 'build';
  return 'foundation';
}

function formScore(form) {
  if (!finite(form)) return 50;
  const value = Number(form);
  if (value >= -10 && value <= 12) return 85;
  if (value < -25) return 30;
  if (value < -15) return 50;
  if (value > 30) return 45;
  if (value > 20) return 65;
  return 72;
}

function suggestedSessionType(actionCode, original) {
  if (actionCode === 'rest_assess') return 'Rest / assessment';
  if (actionCode === 'replace_easy_or_rest') return 'Rest / easy recovery';
  if (actionCode === 'replace_with_easy') return 'Easy aerobic / walk';
  if (actionCode === 'check_in_first') return 'Easy until check-in';
  if (actionCode === 'cap_long_run') return 'Shortened long easy';
  return original || 'Rest';
}

function sessionType(session) {
  return String(session?.t || session?.type || 'Rest');
}

function percentChange(current, previous) {
  if (!(Number(previous) > 0)) return null;
  return Math.round(((Number(current) - Number(previous)) / Number(previous)) * 100);
}

function activityDuration(item) {
  return Math.max(0, Number(item?.durationMin || item?.movingTimeMin || item?.elapsedTimeMin) || 0);
}

function isFootActivity(activity = {}) {
  const haystack = `${activity.type || ''} ${activity.name || ''} ${activity.sportType || ''}`.toLowerCase();
  if (/bike|cycling|swim|row|elliptical|strength/.test(haystack)) return false;
  if (/run|trail|walk|hike|treadmill/.test(haystack)) return true;
  return Number(activity.distanceKm) > 0 && String(activity.terrain || '').toLowerCase() !== 'strength';
}

function emptyWeek() {
  return { sessions: 0, activeDays: 0, distanceKm: 0, elevationGainM: 0, durationMin: 0, totalLoad: 0, mechanicalLoad: 0, longestDistanceKm: 0, longestDurationMin: 0, climbDensityMPerKm: 0, trailEquivalentKm: 0 };
}
