const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const FEEDBACK_PREFIX = 'scoreCalibrationFeedback:';

export const CALIBRATION_MIN_DAYS = 7;
export const CALIBRATION_PERSONALIZED_DAYS = 21;

export function calibrationFeedbackId(date) {
  return `${FEEDBACK_PREFIX}${date}`;
}

export function isCalibrationFeedback(record) {
  return Boolean(record?.id?.startsWith(FEEDBACK_PREFIX) || record?.type === 'scoreCalibrationFeedback');
}

export function selectCalibrationFeedback(metadata = [], endDateKey = null, { includeEndDate = false } = {}) {
  return metadata
    .filter(isCalibrationFeedback)
    .filter(item => !endDateKey || (includeEndDate ? item.date <= endDateKey : item.date < endDateKey))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

export function readinessAnswerToScore(value) {
  const numeric = clamp(Number(value) || 0, 1, 5);
  return [0, 15, 35, 55, 75, 95][numeric];
}

export function buildCalibrationProfile(state = {}, endDateKey = null, options = {}) {
  const enabled = state.settings?.scoring?.calibrationEnabled !== false;
  const feedback = selectCalibrationFeedback(state.metadata || [], endDateKey, options);
  const readinessRows = feedback.filter(item => Number(item.actualReadiness) >= 1 && Number(item.predicted?.readiness) >= 0);
  const strainRows = feedback.filter(item => Number(item.perceivedStrain) >= 0 && Number(item.predicted?.strain) >= 0);
  const readinessResiduals = readinessRows.map(item => readinessAnswerToScore(item.actualReadiness) - Number(item.predicted.readiness));
  const strainResiduals = strainRows.map(item => Number(item.perceivedStrain) - Number(item.predicted.strain));
  const readinessLearning = clamp(readinessRows.length / CALIBRATION_PERSONALIZED_DAYS, 0, 1);
  const strainLearning = clamp(strainRows.length / 14, 0, 1);
  const readinessBias = enabled
    ? clamp(robustCenter(readinessResiduals) * readinessLearning, -10, 10)
    : 0;
  const strainBias = enabled
    ? clamp(robustCenter(strainResiduals) * strainLearning, -2.5, 2.5)
    : 0;
  const componentModifiers = enabled ? learnComponentModifiers(readinessRows, readinessLearning) : {};
  const maeBefore = mean(readinessResiduals.map(Math.abs));
  const maeAfter = mean(readinessResiduals.map(value => Math.abs(value - readinessBias)));
  const phase = readinessRows.length < CALIBRATION_MIN_DAYS
    ? 'bootstrap'
    : readinessRows.length < CALIBRATION_PERSONALIZED_DAYS
      ? 'learning'
      : 'personalized';
  const confidence = Math.round(clamp(
    (readinessRows.length / CALIBRATION_PERSONALIZED_DAYS) * 72 +
    (strainRows.length / 14) * 18 +
    Object.keys(componentModifiers).length * 2,
    0,
    100
  ));

  return {
    enabled,
    phase,
    feedbackCount: feedback.length,
    readinessFeedbackCount: readinessRows.length,
    strainFeedbackCount: strainRows.length,
    readinessBias: Number(readinessBias.toFixed(1)),
    strainBias: Number(strainBias.toFixed(1)),
    componentModifiers,
    confidence,
    minimumDays: CALIBRATION_MIN_DAYS,
    personalizedDays: CALIBRATION_PERSONALIZED_DAYS,
    lastFeedbackDate: feedback.at(-1)?.date || null,
    maeBefore: Number((maeBefore || 0).toFixed(1)),
    maeAfter: Number((maeAfter || 0).toFixed(1)),
    recentFeedback: feedback.slice(-7).reverse()
  };
}

export function applyReadinessCalibration(score, profile) {
  const raw = Number(score);
  if (!Number.isFinite(raw) || !profile?.enabled) return raw;
  return Math.round(clamp(raw + (Number(profile.readinessBias) || 0), 0, 100));
}

export function applyStrainCalibration(score, profile) {
  const raw = Number(score);
  if (!Number.isFinite(raw) || !profile?.enabled) return raw;
  return Number(clamp(raw + (Number(profile.strainBias) || 0), 0, 21).toFixed(1));
}

export function calibratedComponentWeight(key, baseWeight, profile) {
  const modifier = Number(profile?.componentModifiers?.[key]) || 1;
  return Number((baseWeight * clamp(modifier, 0.8, 1.2)).toFixed(4));
}

export function createCalibrationFeedback({ date, actualReadiness, perceivedStrain = null, sessionOutcome = 'none', note = '', predicted = {} }) {
  const now = new Date().toISOString();
  return {
    id: calibrationFeedbackId(date),
    type: 'scoreCalibrationFeedback',
    date,
    actualReadiness: clamp(Number(actualReadiness) || 3, 1, 5),
    perceivedStrain: perceivedStrain === '' || perceivedStrain == null ? null : clamp(Number(perceivedStrain), 0, 21),
    sessionOutcome,
    note: String(note || '').trim(),
    predicted: {
      readiness: finiteOrNull(predicted.readiness),
      recovery: finiteOrNull(predicted.recovery),
      strain: finiteOrNull(predicted.strain),
      recoveryComponents: Array.isArray(predicted.recoveryComponents)
        ? predicted.recoveryComponents.map(item => ({ key: item.key, score: finiteOrNull(item.score) })).filter(item => item.key && item.score != null)
        : []
    },
    createdAt: predicted.createdAt || now,
    updatedAt: now
  };
}

function learnComponentModifiers(rows, learningFactor) {
  const keys = new Set();
  for (const row of rows) for (const component of row.predicted?.recoveryComponents || []) keys.add(component.key);
  const modifiers = {};
  for (const key of keys) {
    const pairs = rows.map(row => {
      const component = row.predicted?.recoveryComponents?.find(item => item.key === key);
      return component?.score == null ? null : [Number(component.score), readinessAnswerToScore(row.actualReadiness)];
    }).filter(Boolean);
    if (pairs.length < CALIBRATION_MIN_DAYS) continue;
    const correlation = pearson(pairs.map(pair => pair[0]), pairs.map(pair => pair[1]));
    const target = clamp(0.85 + Math.max(0, correlation) * 0.30, 0.85, 1.15);
    const modifier = 1 + (target - 1) * learningFactor;
    modifiers[key] = Number(clamp(modifier, 0.85, 1.15).toFixed(3));
  }
  return modifiers;
}

function pearson(xs, ys) {
  if (xs.length !== ys.length || xs.length < 2) return 0;
  const mx = mean(xs);
  const my = mean(ys);
  let numerator = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let index = 0; index < xs.length; index += 1) {
    const dx = xs[index] - mx;
    const dy = ys[index] - my;
    numerator += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denominator = Math.sqrt(dx2 * dy2);
  return denominator > 0 ? clamp(numerator / denominator, -1, 1) : 0;
}

function robustCenter(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const trimmed = sorted.length >= 7 ? sorted.slice(1, -1) : sorted;
  const middle = Math.floor(trimmed.length / 2);
  return trimmed.length % 2 ? trimmed[middle] : (trimmed[middle - 1] + trimmed[middle]) / 2;
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((total, value) => total + (Number(value) || 0), 0) / values.length;
}

function finiteOrNull(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}
