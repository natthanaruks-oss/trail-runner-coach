import { calculateRecovery } from './recovery.js';
import { calculateBehaviorLoad, calculateLoadTrend, loadWindow } from './strain.js';
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
  const recent = painLogs.filter(log => log.date >= addDays(dateKey, -6));
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
  const recovery = calculateRecovery(checkin, settings, checkinHistory);
  const subjectiveComplete = Boolean(
    Number.isFinite(Number(checkin?.fatigue)) &&
    Number.isFinite(Number(checkin?.stress)) &&
    Number.isFinite(Number(checkin?.muscleSoreness)) &&
    checkin?.pain && typeof checkin.pain === 'object'
  );
  const pain = evaluatePainSafety(checkin, painLogs, dateKey);
  const trend = calculateLoadTrend(activities, dateKey);
  const recent3 = loadWindow(activities, addDays(dateKey, -1), 3);
  const previousDayCheckin = checkinHistory.find(item => item.date === addDays(dateKey, -1)) || null;
  const behaviorLoad = calculateBehaviorLoad(previousDayCheckin, checkinHistory);
  const recentLoadPenalty = clamp(recent3.totalLoad / 45, 0, 22);
  const trendPenalty = trend.warning.level === 'high' ? 12 : trend.warning.level === 'moderate' ? 6 : 0;
  const recoveryBase = recovery.score ?? 60;
  const behaviorPenalty = behaviorLoad.penalty || 0;
  let score = recoveryBase * 0.72 + pain.score * 0.28 - recentLoadPenalty - trendPenalty - behaviorPenalty;

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
  const confidence = Math.round(clamp(
    (recovery.confidence || 0) * 0.7 +
    (checkin ? 15 : 0) +
    (activities.some(activity => activity.date >= addDays(dateKey, -7)) ? 15 : 0),
    10,
    100
  ));

  return {
    date: dateKey,
    score,
    status,
    confidence,
    recovery,
    pain,
    loadTrend: trend,
    recentLoadPenalty: Math.round(recentLoadPenalty),
    trendPenalty,
    behaviorLoad,
    behaviorPenalty,
    subjectiveComplete,
    flags: [...new Set(flags)]
  };
}
