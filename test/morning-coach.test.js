import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMorningCoach } from '../public/js/core/morning-coach.js';

function baseInput(overrides = {}) {
  return {
    today: {
      dateKey: '2026-06-29',
      checkin: { date: '2026-06-29' },
      readiness: { pain: { hardStop: false, caution: false } },
      plan: {
        todaySession: { id: 's1', t: 'Tempo', km: 10, vert: 200, durationMin: 70 }
      }
    },
    unified: {
      readiness: { score: 78, status: 'green' },
      pillars: {
        recovery: { score: 76, status: 'good' },
        load: { score: 72, status: 'balanced' },
        energy: { score: 70, status: 'good' }
      },
      coverage: { confidence: 82 }
    },
    trailCoach: {
      confidence: 80,
      prescription: {
        actionCode: 'follow_plan',
        suggestedType: 'Tempo',
        suggestedDistanceKm: 10,
        suggestedVerticalM: 200,
        distanceFactor: 1,
        verticalFactor: 1,
        intensityCode: 'planned_quality',
        confidence: 84,
        reasons: [{ code: 'signals_support_plan', tone: 'good' }],
        missing: [],
        hardStop: false,
        safeToEscalate: true
      }
    },
    personalTrends: { load: { form: 2.5 } },
    ...overrides
  };
}

test('pain hard stop always overrides a green prescription', () => {
  const input = baseInput();
  input.today.readiness.pain.hardStop = true;
  input.trailCoach.prescription.actionCode = 'follow_plan';
  input.trailCoach.prescription.hardStop = false;

  const result = buildMorningCoach(input);

  assert.equal(result.actionCode, 'rest_assess');
  assert.equal(result.status, 'red');
  assert.equal(result.hardStop, true);
  assert.equal(result.primaryRoute, 'checkin');
  assert.equal(result.safeToEscalate, false);
  assert.equal(result.reasons[0].code, 'pain_hard_stop');
});

test('missing subjective check-in keeps a hard session controlled', () => {
  const input = baseInput();
  input.today.checkin = null;
  input.trailCoach.prescription = {
    actionCode: 'check_in_first',
    suggestedType: 'Easy until check-in',
    distanceFactor: 0.75,
    verticalFactor: 0.65,
    intensityCode: 'easy_until_checkin',
    confidence: 60,
    reasons: [{ code: 'subjective_data_missing', tone: 'watch' }],
    missing: ['subjective_checkin'],
    hardStop: false
  };

  const result = buildMorningCoach(input);

  assert.equal(result.actionCode, 'check_in_first');
  assert.equal(result.status, 'yellow');
  assert.equal(result.requiresCheckin, true);
  assert.equal(result.primaryRoute, 'checkin');
});

test('low recovery recommendation is never escalated by Morning Coach', () => {
  const input = baseInput();
  input.unified.pillars.recovery.score = 32;
  input.trailCoach.prescription = {
    actionCode: 'replace_easy_or_rest',
    suggestedType: 'Rest / easy recovery',
    distanceFactor: 0.35,
    verticalFactor: 0.2,
    intensityCode: 'recovery_only',
    confidence: 74,
    reasons: [{ code: 'recovery_low', tone: 'risk', value: 32 }],
    missing: [],
    hardStop: false,
    safeToEscalate: false
  };

  const result = buildMorningCoach(input);

  assert.equal(result.actionCode, 'replace_easy_or_rest');
  assert.equal(result.status, 'red');
  assert.equal(result.recommendation.intensityCode, 'recovery_only');
  assert.equal(result.safeToEscalate, false);
});

test('supported signals preserve the existing follow-plan prescription', () => {
  const result = buildMorningCoach(baseInput());

  assert.equal(result.actionCode, 'follow_plan');
  assert.equal(result.status, 'green');
  assert.equal(result.recommendation.distanceKm, 10);
  assert.equal(result.recommendation.verticalM, 200);
  assert.equal(result.trace.source, 'trail_coach_prescription');
});

test('fallback mode remains conservative when the prescription is absent', () => {
  const input = baseInput();
  input.trailCoach = {};
  input.today.checkin = null;
  input.unified.readiness.score = 52;

  const result = buildMorningCoach(input);

  assert.equal(result.actionCode, 'check_in_first');
  assert.equal(result.status, 'yellow');
  assert.equal(result.trace.source, 'morning_coach_fallback');
});
