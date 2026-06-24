import { calculateRecovery } from './recovery.js';
import { calculateBehaviorLoad, calculateDailyStrain, calculateLoadTrend, strainWindow } from './strain.js';
import { addDays, localDateKey } from '../core/date.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function evaluatePainSafety(checkin, painLogs = [], dateKey = localDateKey()) {
  const currentPain = {
    itb: Number(checkin?.pain?.itb) || 0,
    achilles: Number(checkin?.pain?.achilles) || 0,
    plantar: Number(checkin?.pain?.plantar) || 0,
    other: Number(checkin?.pain?.other) || 0
  };
  const maxPain = Math.max(...Object.values(currentPain));
  const recent = painLogs.filter(log => log.date >= addDays(dateKey, -6) && log.date <= dateKey);
  const recurring = Object.entries(recent.reduce((acc, log) => {
    if (Number(log.severity) >= 3) acc[log.area] = (acc[log.area] || 0) + 1;
    return acc;
  }, {})).filter(([, count]) => count >= 3).map(([area]) => area);

  const hardStop = Boolean(
    maxPain >= 6 ||
    checkin?.painWithWalking ||
    checkin?.alteredGait ||
    checkin?.swelling ||
    checkin?.illnessSymptoms ||
    checkin?.unusualDizziness
  );
  const caution = !hardStop && (maxPain >= 3 || recurring.length > 0);

  return {
    maxPain,
    currentPain,
    recurring,
    hardStop,
    caution,
    score: hardStop ? 10 : caution ? Math.max(35, 100 - maxPain * 12) : Math.max(75, 100 - maxPain * 7),
    flags: [
      ...(maxPain >= 6 ? ['pain_6_plus'] : []),
      ...(checkin?.painWithWalking ? ['pain_with_walking'] : []),
      ...(checkin?.alteredGait ? ['altered_gait'] : []),
      ...(checkin?.swelling ? ['swelling'] : []),
      ...(recurring.length ? ['recurring_pain'] : [])
    ]
  };
}

export function calculateReadiness({ checkin, checkinHistory = [], activities = [], painLogs = [], settings = {}, dateKey = localDateKey() }) {
  const priorCheckins = checkinHistory.filter(item => item.date < dateKey);
  const previousDate = addDays(dateKey, -1);
  const previousDayCheckin = checkinHistory.find(item => item.date === previousDate) || null;
  const previousDayStrain = calculateDailyStrain(activities, previousDate, previousDayCheckin, priorCheckins.filter(item => item.date < previousDate));
  const recentStrain = strainWindow(activities, checkinHistory, previousDate, 3);
  const recovery = calculateRecovery(checkin, settings, checkinHistory, {
    previousDayStrain,
    recentStrainAverage: recentStrain.averageScore
  });
  const subjectiveComplete = Boolean(
    Number.isFinite(Number(checkin?.fatigue)) &&
    Number.isFinite(Number(checkin?.stress)) &&
    Number.isFinite(Number(checkin?.muscleSoreness)) &&
    checkin?.pain && typeof checkin.pain === 'object'
  );
  const pain = evaluatePainSafety(checkin, painLogs, dateKey);
  const trend = calculateLoadTrend(activities, dateKey);
  const behaviorLoad = calculateBehaviorLoad(previousDayCheckin, priorCheckins);
  const trendPenalty = trend.warning.level === 'high' ? 10 : trend.warning.level === 'moderate' ? 5 : 0;
  const recoveryBase = recovery.score ?? 58;
  let score = recoveryBase * 0.82 + pain.score * 0.18 - trendPenalty;

  const flags = [...recovery.flags, ...pain.flags, ...behaviorLoad.flags];
  if (trend.warning.level === 'high') flags.push('rapid_load_increase');
  if (!subjectiveComplete) {
    flags.push('missing_subjective_check');
    score = Math.min(score, 69);
  }
  if (pain.hardStop) score = Math.min(score, 30);
  else if (pain.caution) score = Math.min(score, 64);
  if (recovery.flags.includes('illness_symptoms') || recovery.flags.includes('unusual_dizziness')) score = Math.min(score, 20);

  score = Math.round(clamp(score, 0, 100));
  const status = pain.hardStop || score < 45 ? 'red' : score < 70 || pain.caution ? 'yellow' : 'green';
  const activityHistoryAvailable = activities.some(activity => activity.date >= addDays(dateKey, -7) && activity.date <= dateKey);
  const confidence = Math.round(clamp(
    (recovery.confidence || 0) * 0.78 +
    (subjectiveComplete ? 12 : 0) +
    (activityHistoryAvailable ? 10 : 0),
    10,
    100
  ));

  const drivers = [
    ...recovery.drivers.slice(0, 5).map(item => ({ key: item.key, direction: item.direction, impact: item.impact, value: item.value })),
    ...(pain.caution || pain.hardStop ? [{ key: 'painSafety', direction: 'negative', impact: pain.hardStop ? -40 : -18, value: pain.maxPain }] : []),
    ...(trendPenalty ? [{ key: 'loadTrend', direction: 'negative', impact: -trendPenalty, value: trend.weekChangePct }] : [])
  ].sort((a, b) => Math.abs(b.impact || 0) - Math.abs(a.impact || 0));

  return {
    date: dateKey,
    score,
    status,
    confidence,
    recovery,
    pain,
    loadTrend: trend,
    previousDayStrain,
    recentStrainAverage: recentStrain.averageScore,
    trendPenalty,
    behaviorLoad,
    subjectiveComplete,
    drivers,
    flags: [...new Set(flags)]
  };
}
