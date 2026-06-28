import { STORES } from './constants.js';
import { addDays, daysBetween, localDateKey, nowIso } from './date.js';
import { flattenPlan } from './plan.js';
import { getActivePlan } from './races.js';
import { calculateSessionLoad } from '../engines/strain.js';

export const PLAN_RECONCILIATION_META_ID = 'plan_reconciliation_v1';
export const AUTO_MATCH_THRESHOLD = 80;
export const REVIEW_MATCH_THRESHOLD = 60;
export const SPLIT_AUTO_MATCH_THRESHOLD = 90;
export const MAX_SPLIT_ACTIVITIES = 4;

const AUTO_COMPLETED_STATUSES = new Set(['completed', 'partial', 'exceeded']);
const PROTECTED_STATUSES = new Set(['completed', 'partial', 'exceeded', 'modified', 'skipped']);

const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const sum = values => values.reduce((total, value) => total + (Number(value) || 0), 0);

function plannedDuration(session) {
  if (finite(session?.durationMin)) return Number(session.durationMin);
  if (finite(session?.minutes)) return Number(session.minutes);
  const distance = Number(session?.km) || 0;
  if (!distance) return null;
  const type = String(session?.t || '');
  const pace = /Long|B2B|Night|Hill|Race/i.test(type) ? 11 : /Tempo|Interval/i.test(type) ? 7 : 8.5;
  return Math.round(distance * pace);
}

function sessionCategory(session) {
  const text = `${session?.t || ''} ${session?.title || ''}`.toLowerCase();
  if (/rest|rehab|recovery/.test(text)) return 'recovery';
  if (/strength|gym|mobility/.test(text)) return 'strength';
  if (/run|easy|tempo|hill|long|b2b|night|race|interval/.test(text)) return 'run';
  return 'other';
}

function activityCategory(activity) {
  const text = `${activity?.type || ''} ${activity?.name || ''} ${activity?.terrain || ''}`.toLowerCase();
  if (/strength|weight|gym|functional/.test(text)) return 'strength';
  if (/run|trail|jog|hike|hiking/.test(text)) return 'run';
  if (/walk/.test(text)) return 'walk';
  return 'other';
}

function isContinuousEnduranceSession(session) {
  const text = `${session?.t || ''} ${session?.title || ''}`.toLowerCase();
  return /long|b2b|race|night|time on feet/.test(text)
    || Number(session?.km) >= 14
    || Number(plannedDuration(session)) >= 90;
}

function subtypeScore(session, activity) {
  const sessionText = `${session?.t || ''} ${session?.title || ''}`.toLowerCase();
  const activityText = `${activity?.type || ''} ${activity?.name || ''} ${activity?.terrain || ''}`.toLowerCase();
  if (/hill/.test(sessionText) && (/hill|mountain|trail/.test(activityText) || Number(activity?.elevationGainM) >= 300)) return 25;
  if (/long|b2b|night/.test(sessionText) && (Number(activity?.durationMin) >= 90 || Number(activity?.distanceKm) >= 14)) return 25;
  if (/tempo|interval/.test(sessionText) && /tempo|interval|threshold|speed/.test(activityText)) return 25;
  if (/easy/.test(sessionText) && /easy|recovery|base/.test(activityText)) return 25;
  return 18;
}

function closenessScore(actual, planned, maximum) {
  if (!(finite(actual) && finite(planned) && Number(planned) > 0)) return 0;
  const ratio = Math.abs(Number(actual) - Number(planned)) / Number(planned);
  return Math.round(maximum * clamp(1 - ratio, 0, 1));
}

export function scorePlanActivityMatch(session, activity) {
  if (!session?.date || !activity?.date) return { score: 0, eligible: false, reasons: ['missing_date'] };
  const dayDiff = Math.abs(daysBetween(session.date, activity.date));
  if (dayDiff > 1) return { score: 0, eligible: false, reasons: ['outside_date_window'] };
  const sessionKind = sessionCategory(session);
  const activityKind = activityCategory(activity);
  if (sessionKind === 'recovery' || sessionKind === 'other') return { score: 0, eligible: false, reasons: ['non_trainable_session'] };
  if (sessionKind !== activityKind) return { score: 0, eligible: false, reasons: ['activity_type_mismatch'] };

  const dateScore = dayDiff === 0 ? 35 : 22;
  const typeScore = subtypeScore(session, activity);
  const durationScore = closenessScore(activity.durationMin, plannedDuration(session), 15);
  const distanceScore = closenessScore(activity.distanceKm, session.km, 15);
  const elevationScore = Number(session.vert) > 0
    ? closenessScore(activity.elevationGainM, session.vert, 10)
    : (Number(activity.elevationGainM) >= 0 ? 5 : 0);
  const score = Math.round(clamp(dateScore + typeScore + durationScore + distanceScore + elevationScore, 0, 100));
  return {
    score,
    eligible: score >= REVIEW_MATCH_THRESHOLD,
    dayDiff,
    components: { dateScore, typeScore, durationScore, distanceScore, elevationScore },
    reasons: [
      dayDiff === 0 ? 'same_day' : 'adjacent_day',
      'compatible_type',
      ...(durationScore >= 10 ? ['duration_close'] : []),
      ...(distanceScore >= 10 ? ['distance_close'] : []),
      ...(elevationScore >= 7 ? ['elevation_close'] : [])
    ]
  };
}

function completionMetrics(session, activity) {
  const distancePct = Number(session.km) > 0 && finite(activity.distanceKm)
    ? Math.round((Number(activity.distanceKm) / Number(session.km)) * 100)
    : null;
  const plannedMin = plannedDuration(session);
  const durationPct = plannedMin > 0 && finite(activity.durationMin)
    ? Math.round((Number(activity.durationMin) / plannedMin) * 100)
    : null;
  const elevationPct = Number(session.vert) > 0 && finite(activity.elevationGainM)
    ? Math.round((Number(activity.elevationGainM) / Number(session.vert)) * 100)
    : null;
  const primary = distancePct ?? durationPct ?? 100;
  const status = primary < 80 ? 'partial' : primary > 125 || (elevationPct != null && elevationPct > 140) ? 'exceeded' : 'completed';
  return {
    status,
    completionPct: Math.max(0, primary),
    distancePct,
    durationPct,
    elevationPct,
    plannedDurationMin: plannedMin
  };
}

function weightedAverage(activities, key) {
  const rows = activities.filter(item => finite(item?.[key]));
  if (!rows.length) return null;
  const durationWeight = sum(rows.map(item => Math.max(0, Number(item.durationMin) || 0)));
  if (durationWeight > 0) {
    return Number((sum(rows.map(item => Number(item[key]) * Math.max(0, Number(item.durationMin) || 0))) / durationWeight).toFixed(1));
  }
  return Number((sum(rows.map(item => Number(item[key]))) / rows.length).toFixed(1));
}

function timestampFor(activity) {
  const candidate = activity.startTime || activity.startedAt || activity.startDate || null;
  const parsed = candidate ? new Date(candidate).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function aggregateActivities(activities = []) {
  const sorted = [...activities].sort((a, b) => {
    const aTime = timestampFor(a);
    const bTime = timestampFor(b);
    if (aTime != null && bTime != null) return aTime - bTime;
    return `${a.date || ''}:${a.startTime || ''}`.localeCompare(`${b.date || ''}:${b.startTime || ''}`);
  });
  const first = sorted[0] || {};
  const categories = new Set(sorted.map(activityCategory));
  const terrains = [...new Set(sorted.map(item => item.terrain).filter(Boolean))];
  const maxHrValues = sorted.map(item => finite(item.maxHr) ? Number(item.maxHr) : null).filter(value => value != null);
  const sessionLoads = sorted.map(activity => calculateSessionLoad(activity));
  return {
    id: `bundle:${sorted.map(item => item.id).join('+')}`,
    date: first.date,
    startTime: first.startTime || first.startedAt || null,
    name: sorted.map(item => item.name || item.type || 'Activity').join(' + '),
    type: categories.size === 1 ? first.type : 'Combined',
    durationMin: sum(sorted.map(item => item.durationMin)),
    distanceKm: sum(sorted.map(item => item.distanceKm)),
    elevationGainM: sum(sorted.map(item => item.elevationGainM)),
    elevationLossM: sum(sorted.map(item => item.elevationLossM)),
    activeEnergyKcal: sum(sorted.map(item => item.activeEnergyKcal)),
    avgHr: weightedAverage(sorted, 'avgHr'),
    maxHr: maxHrValues.length ? Math.max(...maxHrValues) : null,
    rpe: weightedAverage(sorted, 'rpe'),
    terrain: terrains.length === 1 ? terrains[0] : (terrains.length ? 'mixed' : null),
    isNight: sorted.some(item => item.isNight),
    totalLoad: sum(sessionLoads.map(item => item.totalLoad)),
    source: 'combined_activities',
    activityIds: sorted.map(item => item.id),
    activities: sorted
  };
}

function continuityMetrics(session, activities, completion) {
  const isSplitSession = activities.length > 1;
  const continuousObjective = isContinuousEnduranceSession(session);
  const plannedDistance = Number(session.km) || 0;
  const plannedMin = Number(completion.plannedDurationMin) || 0;
  const longestDistance = Math.max(0, ...activities.map(item => Number(item.distanceKm) || 0));
  const longestDuration = Math.max(0, ...activities.map(item => Number(item.durationMin) || 0));
  const continuousCompletionPct = plannedDistance > 0
    ? Math.round((longestDistance / plannedDistance) * 100)
    : plannedMin > 0 ? Math.round((longestDuration / plannedMin) * 100) : 100;
  const specificityPct = !isSplitSession || !continuousObjective
    ? 100
    : Math.round(clamp(continuousCompletionPct, 40, 95));
  const continuousObjectiveStatus = !continuousObjective
    ? 'not_required'
    : !isSplitSession ? 'achieved'
      : continuousCompletionPct >= 80 ? 'mostly_achieved' : 'partially_achieved';
  return {
    isSplitSession,
    activityCount: activities.length,
    continuousObjective,
    continuousCompletionPct: Math.max(0, continuousCompletionPct),
    specificityPct,
    continuousObjectiveStatus
  };
}

function buildWorkoutRecord(session, activities, match, timestamp = nowIso()) {
  const aggregate = aggregateActivities(activities);
  const completion = completionMetrics(session, aggregate);
  const continuity = continuityMetrics(session, activities, completion);
  const threshold = continuity.isSplitSession ? SPLIT_AUTO_MATCH_THRESHOLD : AUTO_MATCH_THRESHOLD;
  const auto = match.score >= threshold;
  const activityIds = activities.map(item => item.id);
  return {
    planSessionId: session.id,
    date: aggregate.date,
    status: auto ? completion.status : 'needs_review',
    completionStatus: completion.status,
    completionPct: completion.completionPct,
    volumeCompletionPct: completion.completionPct,
    distanceCompletionPct: completion.distancePct,
    durationCompletionPct: completion.durationPct,
    elevationCompletionPct: completion.elevationPct,
    actualDistanceKm: finite(aggregate.distanceKm) ? Number(aggregate.distanceKm) : null,
    actualElevationGainM: finite(aggregate.elevationGainM) ? Number(aggregate.elevationGainM) : null,
    elevationLossM: finite(aggregate.elevationLossM) ? Number(aggregate.elevationLossM) : null,
    durationMin: finite(aggregate.durationMin) ? Number(aggregate.durationMin) : null,
    rpe: finite(aggregate.rpe) ? Number(aggregate.rpe) : null,
    avgHr: finite(aggregate.avgHr) ? Number(aggregate.avgHr) : null,
    maxHr: finite(aggregate.maxHr) ? Number(aggregate.maxHr) : null,
    activeEnergyKcal: finite(aggregate.activeEnergyKcal) ? Number(aggregate.activeEnergyKcal) : null,
    actualTrainingLoad: finite(aggregate.totalLoad) ? Number(aggregate.totalLoad) : null,
    terrain: aggregate.terrain || null,
    isNight: Boolean(aggregate.isNight),
    actualActivityId: activityIds[0] || null,
    actualActivityIds: activityIds,
    activitySummaries: activities.map(item => ({
      id: item.id,
      date: item.date,
      startTime: item.startTime || item.startedAt || null,
      name: item.name || item.type || 'Activity',
      type: item.type || null,
      durationMin: finite(item.durationMin) ? Number(item.durationMin) : null,
      distanceKm: finite(item.distanceKm) ? Number(item.distanceKm) : null,
      elevationGainM: finite(item.elevationGainM) ? Number(item.elevationGainM) : null,
      avgHr: finite(item.avgHr) ? Number(item.avgHr) : null
    })),
    ...continuity,
    matchConfidence: match.score,
    matchStatus: auto ? 'auto_matched' : 'needs_review',
    matchReasons: match.reasons,
    source: 'auto_reconciliation',
    plannedSnapshot: {
      date: session.date,
      type: session.t,
      distanceKm: Number(session.km) || 0,
      durationMin: completion.plannedDurationMin,
      elevationGainM: Number(session.vert) || 0
    },
    updatedAt: timestamp
  };
}

export function workoutFromActivityMatch(session, activity, match, timestamp = nowIso()) {
  return buildWorkoutRecord(session, [activity], match, timestamp);
}

export function workoutFromActivityBundle(session, activities, match, timestamp = nowIso()) {
  return buildWorkoutRecord(session, activities, match, timestamp);
}

function combinations(items, size, start = 0, prefix = [], output = []) {
  if (prefix.length === size) {
    output.push(prefix);
    return output;
  }
  for (let index = start; index <= items.length - (size - prefix.length); index += 1) {
    combinations(items, size, index + 1, [...prefix, items[index]], output);
  }
  return output;
}

export function buildActivityBundles(session, activities = []) {
  const compatible = activities.filter(activity => {
    if (!activity?.id || !activity?.date) return false;
    if (Math.abs(daysBetween(session.date, activity.date)) > 1) return false;
    return sessionCategory(session) === activityCategory(activity);
  });
  const groupedByDate = new Map();
  for (const activity of compatible) {
    const list = groupedByDate.get(activity.date) || [];
    list.push(activity);
    groupedByDate.set(activity.date, list);
  }

  const bundles = [];
  for (const sameDayActivities of groupedByDate.values()) {
    const pool = sameDayActivities
      .sort((a, b) => (timestampFor(a) ?? 0) - (timestampFor(b) ?? 0))
      .slice(0, 8);
    const maxSize = Math.min(MAX_SPLIT_ACTIVITIES, pool.length);
    for (let size = 2; size <= maxSize; size += 1) {
      for (const activitySet of combinations(pool, size)) {
        const aggregate = aggregateActivities(activitySet);
        const baseMatch = scorePlanActivityMatch(session, aggregate);
        if (!baseMatch.eligible) continue;
        const completion = completionMetrics(session, aggregate);
        const closeToPlan = completion.completionPct >= 80 && completion.completionPct <= 125;
        const bundlePenalty = 5 + Math.max(0, size - 2) * 2;
        const fitBonus = closeToPlan ? 6 : 0;
        const score = Math.round(clamp(baseMatch.score - bundlePenalty + fitBonus, 0, 100));
        if (score < REVIEW_MATCH_THRESHOLD) continue;
        bundles.push({
          activities: activitySet,
          aggregate,
          match: {
            ...baseMatch,
            score,
            eligible: true,
            isSplitSession: true,
            reasons: [...baseMatch.reasons, 'multi_activity_bundle', ...(closeToPlan ? ['combined_volume_close'] : [])]
          }
        });
      }
    }
  }
  return bundles.sort((a, b) => b.match.score - a.match.score || a.activities.length - b.activities.length);
}

function mayRefreshExisting(existing) {
  if (!existing) return true;
  if (existing.matchStatus === 'rejected' || (existing.status === 'planned' && existing.source === 'manual_review')) return false;
  if (existing.source === 'auto_reconciliation') return true;
  if (existing.status === 'needs_review') return true;
  return !PROTECTED_STATUSES.has(existing.status);
}

export function buildPlanReconciliation(state = {}, { dateKey = localDateKey(), lookbackDays = 45, lookaheadDays = 1 } = {}) {
  const plan = getActivePlan(state);
  if (!plan) return { records: [], decisions: [], summary: emptySummary() };
  const startDate = addDays(dateKey, -Math.max(7, Number(lookbackDays) || 45));
  const endDate = addDays(dateKey, Math.max(0, Number(lookaheadDays) || 1));
  const sessions = flattenPlan(plan).filter(session => session.date >= startDate && session.date <= endDate && sessionCategory(session) !== 'recovery');
  const existingBySession = new Map((state.workouts || []).map(item => [item.planSessionId, item]));
  const linkedActivityIds = new Set((state.workouts || []).flatMap(item => [item.actualActivityId, ...(item.actualActivityIds || [])]).filter(Boolean));
  const activities = (state.activities || []).filter(activity => activity.date >= addDays(startDate, -1) && activity.date <= addDays(endDate, 1));
  const candidates = [];

  for (const session of sessions) {
    const existing = existingBySession.get(session.id);
    if (!mayRefreshExisting(existing)) continue;
    const existingIds = new Set([existing?.actualActivityId, ...(existing?.actualActivityIds || [])].filter(Boolean));
    const available = activities.filter(activity => !linkedActivityIds.has(activity.id) || existingIds.has(activity.id));
    for (const activity of available) {
      const match = scorePlanActivityMatch(session, activity);
      if (match.eligible) candidates.push({ session, activities: [activity], match, existing, kind: 'single' });
    }
    for (const bundle of buildActivityBundles(session, available)) {
      candidates.push({ session, activities: bundle.activities, match: bundle.match, existing, kind: 'bundle' });
    }
  }

  candidates.sort((a, b) => b.match.score - a.match.score
    || a.activities.length - b.activities.length
    || String(a.session.date).localeCompare(String(b.session.date)));
  const usedSessions = new Set();
  const usedActivities = new Set();
  const records = [];
  const decisions = [];
  for (const candidate of candidates) {
    const ids = candidate.activities.map(item => item.id);
    if (usedSessions.has(candidate.session.id) || ids.some(id => usedActivities.has(id))) continue;
    const record = candidate.activities.length > 1
      ? workoutFromActivityBundle(candidate.session, candidate.activities, candidate.match)
      : workoutFromActivityMatch(candidate.session, candidate.activities[0], candidate.match);
    records.push(record);
    const threshold = candidate.activities.length > 1 ? SPLIT_AUTO_MATCH_THRESHOLD : AUTO_MATCH_THRESHOLD;
    decisions.push({
      planSessionId: candidate.session.id,
      activityId: ids[0],
      activityIds: ids,
      activityCount: ids.length,
      isSplitSession: ids.length > 1,
      score: candidate.match.score,
      decision: candidate.match.score >= threshold ? 'auto_match' : 'review',
      reasons: candidate.match.reasons
    });
    usedSessions.add(candidate.session.id);
    ids.forEach(id => usedActivities.add(id));
  }

  const summary = {
    scannedSessions: sessions.length,
    scannedActivities: activities.length,
    autoMatched: decisions.filter(item => item.decision === 'auto_match').length,
    needsReview: decisions.filter(item => item.decision === 'review').length,
    splitMatched: decisions.filter(item => item.isSplitSession && item.decision === 'auto_match').length,
    splitNeedsReview: decisions.filter(item => item.isSplitSession && item.decision === 'review').length,
    linkedActivities: decisions.reduce((total, item) => total + item.activityCount, 0),
    records: records.length
  };
  return { records, decisions, summary };
}

export async function reconcilePlanWorkouts(appStore, options = {}) {
  const result = buildPlanReconciliation(appStore.getState(), options);
  const current = new Map((appStore.getState().workouts || []).map(item => [item.planSessionId, item]));
  const changed = result.records.filter(record => !sameWorkoutRecord(current.get(record.planSessionId), record));
  if (changed.length) await appStore.upsertMany(STORES.WORKOUTS, changed);
  await appStore.upsertRecord(STORES.META, {
    id: PLAN_RECONCILIATION_META_ID,
    schemaVersion: 2,
    reason: options.reason || 'automatic',
    lastRunAt: nowIso(),
    summary: result.summary,
    reviewItems: result.decisions.filter(item => item.decision === 'review').slice(0, 50)
  });
  return { ...result.summary, changed: changed.length, decisions: result.decisions };
}

function sameWorkoutRecord(existing, incoming) {
  if (!existing) return false;
  const omitUpdatedAt = record => Object.fromEntries(Object.entries(record || {}).filter(([key]) => key !== 'updatedAt'));
  return JSON.stringify(omitUpdatedAt(existing)) === JSON.stringify(omitUpdatedAt(incoming));
}

export function isWorkoutCompleted(workout) {
  return AUTO_COMPLETED_STATUSES.has(workout?.status) || workout?.status === 'modified';
}

function emptySummary() {
  return {
    scannedSessions: 0,
    scannedActivities: 0,
    autoMatched: 0,
    needsReview: 0,
    splitMatched: 0,
    splitNeedsReview: 0,
    linkedActivities: 0,
    records: 0
  };
}
