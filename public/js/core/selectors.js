import { calculateReadiness } from '../engines/readiness.js';
import { calculateDailyStrain, calculateLoadTrend, dailyLoad } from '../engines/strain.js';
import { buildCalibrationProfile } from '../engines/calibration.js';
import { getPlanContext, plannedTotals } from './plan.js';
import { getActiveRace, getActivePlan } from './races.js';
import { addDays, dateRange, daysBetween, localDateKey } from './date.js';

export function selectToday(state, dateKey = localDateKey()) {
  const checkin = state.checkins.find(item => item.date === dateKey) || null;
  // Today's feedback starts influencing tomorrow. This avoids tuning a score against itself.
  const calibration = buildCalibrationProfile(state, dateKey);
  const plan = getPlanContext(state, dateKey);
  const race = getActiveRace(state);
  const readiness = checkin ? calculateReadiness({
    checkin,
    checkinHistory: state.checkins,
    activities: state.activities,
    painLogs: state.painLogs,
    settings: state.settings,
    calibration,
    dateKey
  }) : null;
  const load = dailyLoad(state.activities, dateKey);
  const strain = calculateDailyStrain(state.activities, dateKey, checkin, state.checkins.filter(item => item.date < dateKey), calibration);
  const loadTrend = calculateLoadTrend(state.activities, dateKey);
  return { dateKey, checkin, plan, race, readiness, recovery: readiness?.recovery || null, strain, load, loadTrend, calibration };
}

export function selectScoreHistory(state, days = 14, endDateKey = localDateKey()) {
  return dateRange(endDateKey, days).map(dateKey => {
    const checkin = state.checkins.find(item => item.date === dateKey) || null;
    const calibration = buildCalibrationProfile(state, dateKey);
    const readiness = checkin ? calculateReadiness({
      checkin,
      checkinHistory: state.checkins.filter(item => item.date <= dateKey),
      activities: state.activities.filter(item => item.date <= dateKey),
      painLogs: state.painLogs.filter(item => item.date <= dateKey),
      settings: state.settings,
      calibration,
      dateKey
    }) : null;
    const strain = calculateDailyStrain(
      state.activities.filter(item => item.date <= dateKey),
      dateKey,
      checkin,
      state.checkins.filter(item => item.date < dateKey),
      calibration
    );
    return {
      date: dateKey,
      strain: strain.score,
      strainConfidence: strain.confidence,
      recovery: readiness?.recovery?.score ?? null,
      readiness: readiness?.score ?? null,
      status: readiness?.status || 'unknown',
      calibrationPhase: calibration.phase
    };
  });
}

export function selectWeekSummary(state, weekSessions) {
  const totals = plannedTotals(weekSessions);
  const sessionIds = new Set(weekSessions.map(session => session.id));
  const workouts = state.workouts.filter(workout => sessionIds.has(workout.planSessionId));
  const completed = workouts.filter(workout => ['completed', 'modified'].includes(workout.status));
  const actualDistanceKm = completed.reduce((sum, item) => sum + (Number(item.actualDistanceKm) || 0), 0);
  const actualElevationGainM = completed.reduce((sum, item) => sum + (Number(item.actualElevationGainM) || 0), 0);
  return {
    ...totals,
    completedSessions: completed.length,
    completionPct: totals.trainableSessions ? Math.round((completed.length / totals.trainableSessions) * 100) : 0,
    actualDistanceKm,
    actualElevationGainM
  };
}

export function selectRaceCountdown(state, dateKey = localDateKey()) {
  const race = getActiveRace(state);
  if (!race?.date) return { race: null, days: 0, weeks: 0, remainderDays: 0 };
  const days = Math.max(0, daysBetween(dateKey, race.date));
  return { race, days, weeks: Math.floor(days / 7), remainderDays: days % 7 };
}

export function selectPlanSummary(state) {
  const race = getActiveRace(state);
  const plan = getActivePlan(state);
  return { race, plan };
}

export function selectPainTrend(state, area, days = 14, endDateKey = localDateKey()) {
  const startDate = addDays(endDateKey, -(days - 1));
  return state.painLogs
    .filter(log => log.area === area && log.date >= startDate && log.date <= endDateKey)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function selectRecentActivities(state, limit = 5) {
  return [...state.activities].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, limit);
}
