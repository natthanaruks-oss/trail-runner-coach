import { addDays, daysBetween, localDateKey } from './date.js';
import { getActivePlan } from './races.js';

export function flattenPlan(plan) {
  if (!plan?.startDate || !Array.isArray(plan.weeks)) return [];
  const sessions = [];
  let offset = 0;
  plan.weeks.forEach((week, weekIndex) => {
    (week.days || []).forEach((day, dayIndex) => {
      sessions.push({
        ...day,
        id: `${plan.id}:${week.id}-${dayIndex}`,
        planId: plan.id,
        raceId: plan.raceId,
        weekId: week.id,
        weekIndex,
        dayIndex,
        phase: week.phase,
        weekLabel: week.label,
        date: addDays(plan.startDate, offset)
      });
      offset += 1;
    });
  });
  return sessions;
}

export function getPlanContext(state, dateKey = localDateKey()) {
  const plan = getActivePlan(state);
  if (!plan) return { plan: null, sessions: [], index: -1, todaySession: null, weekIndex: 0, week: null, weekSessions: [] };
  const sessions = flattenPlan(plan);
  const index = daysBetween(plan.startDate, dateKey);
  const todaySession = index >= 0 && index < sessions.length ? sessions[index] : null;
  const weekIndex = todaySession?.weekIndex ?? Math.max(0, Math.min(plan.weeks.length - 1, Math.floor(index / 7)));
  const week = plan.weeks[weekIndex] || null;
  const weekSessions = sessions.filter(session => session.weekIndex === weekIndex);
  return { plan, sessions, index, todaySession, weekIndex, week, weekSessions };
}

export function plannedTotals(sessions = []) {
  return sessions.reduce((acc, session) => {
    acc.distanceKm += Number(session.km) || 0;
    acc.elevationGainM += Number(session.vert) || 0;
    if (!['Rest', 'Rehab'].includes(session.t)) acc.trainableSessions += 1;
    return acc;
  }, { distanceKm: 0, elevationGainM: 0, trainableSessions: 0 });
}
