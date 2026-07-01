import { buildRaceHorizonCoach, compactHorizonForAi } from './race-horizon-coach.js';
const finite = value =>
  value !== null &&
  value !== undefined &&
  value !== '' &&
  Number.isFinite(Number(value));

export function buildAiCoachSnapshot({
  state = {},
  today = {},
  unified = {},
  trailCoach = {},
  personalTrends = {},
  countdown = {},
  week = {},
  previousSnapshot = null,
  language = 'th'
} = {}) {
  const prescription = trailCoach?.prescription || {};
  const horizonModel = buildRaceHorizonCoach({ state, today, unified, trailCoach, week, endDateKey: today?.dateKey });
  const session = today?.plan?.todaySession || null;
  const decision = {
    actionCode: String(prescription.actionCode || 'follow_plan'),
    status: decisionStatus(prescription.actionCode, prescription.hardStop),
    hardStop: Boolean(prescription.hardStop || today?.readiness?.pain?.hardStop),
    safeToEscalate: false,
    suggestedType: textValue(prescription.suggestedType, 'Rest'),
    suggestedDistanceKm: numberOrNull(prescription.suggestedDistanceKm),
    suggestedVerticalM: numberOrNull(prescription.suggestedVerticalM),
    distanceFactor: numberOrNull(prescription.distanceFactor),
    verticalFactor: numberOrNull(prescription.verticalFactor),
    intensityCode: String(prescription.intensityCode || 'planned'),
    confidence: bounded(prescription.confidence),
    reasons: (prescription.reasons || []).slice(0, 6).map(reason => ({
      code: String(reason?.code || 'coach_signal'),
      tone: String(reason?.tone || 'neutral'),
      value: numberOrNull(reason?.value)
    })),
    missing: (prescription.missing || []).slice(0, 8).map(String)
  };

  const snapshot = {
    version: 'ai_coach_snapshot_v1',
    contextVersion: 4,
    date: String(today?.dateKey || ''),
    language: language === 'en' ? 'en' : 'th',
    decision,
    plannedSession: session
      ? {
          type: textValue(session?.t || session?.type, 'Rest'),
          title: sessionTitle(session),
          distanceKm: numberOrNull(session?.km),
          verticalM: numberOrNull(session?.vert),
          durationMin: numberOrNull(session?.durationMin ?? session?.minutes)
        }
      : null,
    readiness: {
      score: numberOrNull(unified?.readiness?.score),
      status: textValue(unified?.readiness?.status, 'unknown'),
      confidence: bounded(unified?.readiness?.confidence)
    },
    pillars: {
      recovery: compactPillar(unified?.pillars?.recovery),
      load: compactPillar(unified?.pillars?.load),
      energy: compactPillar(unified?.pillars?.energy)
    },
    race: {
      name: textValue(countdown?.race?.name, ''),
      days: numberOrNull(countdown?.days),
      readinessScore: numberOrNull(trailCoach?.race?.score),
      readinessConfidence: bounded(trailCoach?.race?.confidence),
      stage: textValue(trailCoach?.race?.stage, 'unknown')
    },
    horizon: compactHorizonForAi(horizonModel, language),
    longRun: {
      score: numberOrNull(trailCoach?.longRun?.score),
      confidence: bounded(trailCoach?.longRun?.confidence),
      longestDistanceKm: numberOrNull(trailCoach?.longRun?.longestDistanceKm),
      longestDurationMin: numberOrNull(trailCoach?.longRun?.longestDurationMin)
    },
    trends: {
      form: numberOrNull(personalTrends?.load?.form),
      sleepDebtHours: numberOrNull(personalTrends?.sleep?.debtHours),
      loadWeekChangePct: numberOrNull(unified?.pillars?.load?.weekChangePct)
    },
    changeContext: buildChangeContext(previousSnapshot, { decision, horizonModel, unified }),
    privacy: {
      rawHealthRowsExcluded: true,
      directIdentityExcluded: true,
      secretsExcluded: true
    }
  };

  return {
    ...snapshot,
    digest: digestSnapshot(snapshot)
  };
}

export function digestSnapshot(snapshot) {
  const text = stableStringify(snapshot);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `ac1-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}


function buildChangeContext(previousSnapshot, current = {}) {
  const previous = previousSnapshot && typeof previousSnapshot === 'object'
    ? previousSnapshot
    : null;
  if (!previous) {
    return {
      previousDigest: '',
      changed: true,
      changeCodes: ['first_evaluation']
    };
  }
  const codes = [];
  if (previous?.decision?.actionCode !== current.decision?.actionCode) codes.push('decision_changed');
  if (previous?.horizon?.daysRemaining !== current.horizonModel?.daysRemaining) codes.push('countdown_changed');
  if (previous?.horizon?.block?.focus !== current.horizonModel?.block?.focus) codes.push('block_changed');
  if (previous?.readiness?.score !== current.unified?.readiness?.score) codes.push('readiness_changed');
  return {
    previousDigest: String(previous?.digest || ''),
    changed: codes.length > 0,
    changeCodes: codes.length ? codes : ['re_evaluated_no_material_change']
  };
}

function compactPillar(item = {}) {
  return {
    score: numberOrNull(item?.score),
    status: textValue(item?.status, 'unknown'),
    confidence: bounded(item?.confidence),
    weekChangePct: numberOrNull(item?.weekChangePct),
    observedDate: textValue(item?.observedDate || item?.date, '')
  };
}

function sessionTitle(session = {}) {
  const candidates = [
    session?.title,
    session?.titleTh,
    session?.titleEn,
    session?.name,
    session?.t,
    session?.type
  ];

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (value && typeof value === 'object') {
      const nested =
        value.th ??
        value.en ??
        value.th_TH ??
        value.en_US ??
        value.label ??
        value.name;
      if (typeof nested === 'string' && nested.trim()) return nested.trim();
    }
  }

  return 'Rest';
}

function decisionStatus(actionCode, hardStop) {
  if (hardStop) return 'red';
  if (['rest_assess', 'replace_easy_or_rest'].includes(actionCode)) return 'red';
  if (
    [
      'check_in_first',
      'replace_with_easy',
      'reduce_25',
      'reduce_15',
      'cap_long_run'
    ].includes(actionCode)
  ) {
    return 'yellow';
  }
  return 'green';
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function textValue(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function numberOrNull(value) {
  return finite(value) ? Number(value) : null;
}

function bounded(value) {
  if (!finite(value)) return 0;
  return Math.round(Math.max(0, Math.min(100, Number(value))));
}
