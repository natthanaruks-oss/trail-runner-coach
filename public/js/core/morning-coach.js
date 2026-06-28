const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const finite = value =>
  value !== null &&
  value !== undefined &&
  value !== '' &&
  Number.isFinite(Number(value));

const HARD_SESSION_TYPES = new Set([
  'Hill',
  'Tempo',
  'Long',
  'B2B',
  'Night',
  'Race',
  'Intervals',
  'Interval'
]);

const ACTIONS = Object.freeze({
  rest_assess: {
    status: 'red',
    priority: 100,
    primaryRoute: 'checkin',
    secondaryRoute: 'coach'
  },
  replace_easy_or_rest: {
    status: 'red',
    priority: 90,
    primaryRoute: 'coach',
    secondaryRoute: 'checkin'
  },
  check_in_first: {
    status: 'yellow',
    priority: 80,
    primaryRoute: 'checkin',
    secondaryRoute: 'coach'
  },
  replace_with_easy: {
    status: 'yellow',
    priority: 70,
    primaryRoute: 'coach',
    secondaryRoute: 'plan'
  },
  reduce_25: {
    status: 'yellow',
    priority: 65,
    primaryRoute: 'coach',
    secondaryRoute: 'plan'
  },
  cap_long_run: {
    status: 'yellow',
    priority: 60,
    primaryRoute: 'coach',
    secondaryRoute: 'plan'
  },
  reduce_15: {
    status: 'yellow',
    priority: 55,
    primaryRoute: 'coach',
    secondaryRoute: 'plan'
  },
  taper_quality: {
    status: 'green',
    priority: 30,
    primaryRoute: 'coach',
    secondaryRoute: 'plan'
  },
  follow_plan: {
    status: 'green',
    priority: 10,
    primaryRoute: 'plan',
    secondaryRoute: 'coach'
  }
});

/**
 * Local-only Morning Coach decision layer.
 *
 * This function does not call an AI service and does not create physiological
 * values. It summarizes the existing deterministic Trail Coach prescription,
 * preserves pain/symptom safety gates, and exposes a traceable decision for UI.
 */
export function buildMorningCoach({
  today = {},
  unified = {},
  trailCoach = {},
  personalTrends = {},
  nutritionBalance = null
} = {}) {
  const prescription = trailCoach?.prescription || {};
  const pain = today?.readiness?.pain || {};
  const plannedSession = today?.plan?.todaySession || null;
  const hardStop = Boolean(pain?.hardStop || prescription?.hardStop);

  let actionCode = hardStop
    ? 'rest_assess'
    : normalizeActionCode(
        prescription?.actionCode ||
        fallbackAction({ today, unified, plannedSession })
      );

  if (hardStop) actionCode = 'rest_assess';

  const action = ACTIONS[actionCode] || ACTIONS.follow_plan;
  const missing = unique([
    ...(Array.isArray(prescription?.missing) ? prescription.missing : []),
    ...(!today?.checkin ? ['subjective_checkin'] : [])
  ]);

  const reasons = buildReasons({
    prescription,
    unified,
    actionCode,
    missing,
    hardStop
  });

  const confidence = buildConfidence({
    prescription,
    trailCoach,
    unified,
    missing,
    hardStop
  });

  const plannedType = sessionType(plannedSession);
  const recommendedType =
    prescription?.suggestedType ||
    fallbackSuggestedType(actionCode, plannedType);

  const dataState =
    hardStop ? 'safety_override' :
    missing.length >= 2 || confidence < 35 ? 'limited' :
    missing.length || confidence < 60 ? 'partial' :
    'ready';

  const metrics = {
    readiness: numericOrNull(unified?.readiness?.score),
    recovery: numericOrNull(unified?.pillars?.recovery?.score),
    load: numericOrNull(unified?.pillars?.load?.score),
    energy: numericOrNull(unified?.pillars?.energy?.score),
    confidence,
    form: numericOrNull(personalTrends?.load?.form),
    energyBalanceKcal: numericOrNull(
      nutritionBalance?.balanceKcal ??
      nutritionBalance?.netKcal ??
      nutritionBalance?.energyBalanceKcal
    )
  };

  return {
    version: 'morning_coach_v1',
    date: today?.dateKey || null,
    actionCode,
    status: action.status,
    priority: action.priority,
    hardStop,
    safeToEscalate: false,
    requiresCheckin: missing.includes('subjective_checkin'),
    dataState,
    confidence,
    primaryRoute: action.primaryRoute,
    secondaryRoute: action.secondaryRoute,
    planned: {
      type: plannedType,
      title: sessionTitle(plannedSession, plannedType),
      distanceKm: numericOrNull(plannedSession?.km),
      verticalM: numericOrNull(plannedSession?.vert),
      durationMin: numericOrNull(plannedSession?.durationMin ?? plannedSession?.minutes)
    },
    recommendation: {
      type: recommendedType,
      intensityCode: prescription?.intensityCode || fallbackIntensity(actionCode),
      distanceKm: numericOrNull(prescription?.suggestedDistanceKm),
      verticalM: numericOrNull(prescription?.suggestedVerticalM),
      distanceFactor: numericOrNull(prescription?.distanceFactor),
      verticalFactor: numericOrNull(prescription?.verticalFactor)
    },
    reasons,
    missing,
    metrics,
    trace: {
      source: prescription?.actionCode ? 'trail_coach_prescription' : 'morning_coach_fallback',
      prescriptionActionCode: prescription?.actionCode || null,
      painHardStop: Boolean(pain?.hardStop),
      painCaution: Boolean(pain?.caution),
      loadStatus: unified?.pillars?.load?.status || null,
      readinessStatus: unified?.readiness?.status || null,
      recoveryStatus: unified?.pillars?.recovery?.status || null
    }
  };
}

function fallbackAction({ today, unified, plannedSession }) {
  const pain = today?.readiness?.pain || {};
  const readiness = numericOrNull(unified?.readiness?.score);
  const recovery = numericOrNull(unified?.pillars?.recovery?.score);
  const loadChangePct = numericOrNull(unified?.pillars?.load?.weekChangePct); const loadRisk = unified?.pillars?.load?.status === 'risk' && (loadChangePct === null || loadChangePct > 20);
  const hard = HARD_SESSION_TYPES.has(sessionType(plannedSession));

  if (pain?.hardStop) return 'rest_assess';
  if (!today?.checkin && hard) return 'check_in_first';
  if ((readiness !== null && readiness < 40) || (recovery !== null && recovery < 40)) {
    return 'replace_easy_or_rest';
  }
  if (pain?.caution || loadRisk || (readiness !== null && readiness < 60)) {
    return hard ? 'replace_with_easy' : 'reduce_25';
  }
  if (recovery !== null && recovery < 70) return 'reduce_15';
  return 'follow_plan';
}

function buildReasons({ prescription, unified, actionCode, missing, hardStop }) {
  const existing = Array.isArray(prescription?.reasons)
    ? prescription.reasons
        .filter(Boolean)
        .map(item => ({
          code: String(item.code || 'coach_signal'),
          tone: item.tone || toneForAction(actionCode),
          value: finite(item.value) ? Number(item.value) : null
        }))
    : [];

  if (hardStop && !existing.some(item => item.code === 'pain_hard_stop')) {
    existing.unshift({ code: 'pain_hard_stop', tone: 'risk', value: null });
  }

  if (
    missing.includes('subjective_checkin') &&
    !existing.some(item => item.code === 'subjective_data_missing')
  ) {
    existing.push({
      code: 'subjective_data_missing',
      tone: 'watch',
      value: null
    });
  }

  if (!existing.length) {
    const readiness = numericOrNull(unified?.readiness?.score);
    if (readiness !== null) {
      existing.push({
        code: readiness >= 70 ? 'signals_support_plan' : 'readiness_moderate',
        tone: readiness >= 70 ? 'good' : 'watch',
        value: readiness
      });
    } else {
      existing.push({
        code: 'insufficient_data',
        tone: 'neutral',
        value: null
      });
    }
  }

  return uniqueByCode(existing).slice(0, 4);
}

function buildConfidence({ prescription, trailCoach, unified, missing, hardStop }) {
  const base =
    numericOrNull(prescription?.confidence) ??
    numericOrNull(trailCoach?.confidence) ??
    numericOrNull(unified?.coverage?.confidence) ??
    0;

  let confidence = base - missing.length * 7;
  if (hardStop) confidence = Math.max(confidence, 90);
  return Math.round(clamp(confidence, 0, 100));
}

function normalizeActionCode(value) {
  return ACTIONS[value] ? value : 'follow_plan';
}

function fallbackSuggestedType(actionCode, plannedType) {
  if (actionCode === 'rest_assess') return 'Rest / assessment';
  if (actionCode === 'replace_easy_or_rest') return 'Rest / easy recovery';
  if (actionCode === 'replace_with_easy') return 'Easy aerobic / walk';
  if (actionCode === 'check_in_first') return 'Easy until check-in';
  if (actionCode === 'cap_long_run') return 'Shortened long easy';
  return plannedType || 'Rest';
}

function fallbackIntensity(actionCode) {
  const map = {
    rest_assess: 'rest_only',
    replace_easy_or_rest: 'recovery_only',
    replace_with_easy: 'easy_aerobic',
    check_in_first: 'easy_until_checkin',
    reduce_25: 'easy_aerobic',
    reduce_15: 'easy_controlled',
    cap_long_run: 'easy_endurance',
    taper_quality: 'short_quality_no_extra',
    follow_plan: 'planned'
  };
  return map[actionCode] || 'easy_controlled';
}

function toneForAction(actionCode) {
  const status = (ACTIONS[actionCode] || ACTIONS.follow_plan).status;
  return status === 'red' ? 'risk' : status === 'yellow' ? 'watch' : 'good';
}

function sessionTitle(session, fallback = 'Rest') {
  const candidates = [
    session?.title,
    session?.titleTh,
    session?.titleEn,
    session?.name,
    session?.t,
    fallback
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

  return String(fallback || 'Rest');
}

function sessionType(session) {
  return String(session?.t || session?.type || 'Rest');
}

function numericOrNull(value) {
  return finite(value) ? Number(value) : null;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function uniqueByCode(values) {
  const seen = new Set();
  return values.filter(item => {
    if (!item?.code || seen.has(item.code)) return false;
    seen.add(item.code);
    return true;
  });
}
