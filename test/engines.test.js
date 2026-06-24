import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBehaviorLoad, calculateSessionLoad, calculateLoadTrend } from '../public/js/engines/strain.js';
import { calculateRecovery } from '../public/js/engines/recovery.js';
import { calculateReadiness } from '../public/js/engines/readiness.js';
import { recommendSession } from '../public/js/engines/recommendation.js';
import { flattenPlan } from '../public/js/core/plan.js';
import { createPlanFromTemplate, createRaceProfile } from '../public/js/core/races.js';
import { DEFAULT_TRAINING_PLAN } from '../public/js/data/defaults.js';
import { normalizeAppleHealthPayload } from '../public/js/adapters/apple-health.js';
import { parseBodyCompositionImport } from '../public/js/adapters/body-import.js';

const settings = { athlete: { restingHrBaseline: 55 } };

test('trail elevation, descent and night work increase mechanical load', () => {
  const road = calculateSessionLoad({ durationMin: 60, rpe: 5, distanceKm: 8, elevationGainM: 0, elevationLossM: 0, terrain: 'road' });
  const trail = calculateSessionLoad({ durationMin: 60, rpe: 5, distanceKm: 8, elevationGainM: 700, elevationLossM: 700, terrain: 'trail', isNight: true });
  assert.ok(trail.mechanicalLoad > road.mechanicalLoad);
  assert.ok(trail.totalLoad > road.totalLoad);
});

test('good recovery is scored higher than poor recovery', () => {
  const good = calculateRecovery({ sleepHours: 8, sleepQuality: 5, restingHr: 54, fatigue: 1, stress: 2, muscleSoreness: 1, source: 'manual' }, settings, []);
  const poor = calculateRecovery({ sleepHours: 4.5, sleepQuality: 1, restingHr: 65, fatigue: 5, stress: 5, muscleSoreness: 5, source: 'manual' }, settings, []);
  assert.ok(good.score > poor.score);
  assert.ok(poor.flags.includes('short_sleep'));
  assert.ok(poor.flags.includes('elevated_resting_hr'));
});

test('pain at six out of ten creates a red readiness safety gate', () => {
  const readiness = calculateReadiness({
    checkin: { date: '2026-06-23', sleepHours: 8, sleepQuality: 5, restingHr: 54, fatigue: 1, stress: 1, muscleSoreness: 1, pain: { achilles: 6 } },
    checkinHistory: [], activities: [], painLogs: [], settings, dateKey: '2026-06-23'
  });
  assert.equal(readiness.status, 'red');
  assert.ok(readiness.score <= 30);
  assert.ok(readiness.flags.includes('pain_6_plus'));
});

test('yellow readiness replaces hard session with easy work', () => {
  const recommendation = recommendSession({ status: 'yellow', flags: ['short_sleep'], loadTrend: { warning: { level: 'normal' } } }, { t: 'Long', title: { th: 'Long run' } });
  assert.equal(recommendation.action, 'replace_with_easy');
  assert.ok(recommendation.distanceFactor < 1);
});

test('bundled plan has 20 weeks and plan-scoped session identifiers', () => {
  const sessions = flattenPlan(DEFAULT_TRAINING_PLAN);
  assert.equal(sessions.length, 140);
  assert.equal(sessions.find(item => item.t === 'Race')?.date, '2026-10-16');
  assert.ok(sessions.every(item => item.id.startsWith(`${DEFAULT_TRAINING_PLAN.id}:`)));
});

test('a new race creates an independent plan aligned to its race date', () => {
  const race = createRaceProfile({ name: 'Future Mountain 50K', date: '2027-02-14', distanceKm: 50, elevationGainM: 2800, elevationLossM: 2700, cutoffHours: 12, nightRunning: true });
  const plan = createPlanFromTemplate(race);
  const sessions = flattenPlan(plan);
  const raceSession = sessions.find(item => item.t === 'Race');
  assert.equal(plan.raceId, race.id);
  assert.equal(raceSession.date, race.date);
  assert.equal(raceSession.km, 50);
  assert.equal(raceSession.vert, 2800);
  assert.match(raceSession.title.th, /Future Mountain 50K/);
});

test('load trend returns warning metadata without claiming injury prediction', () => {
  const activities = Array.from({ length: 7 }, (_, index) => ({
    id: `a${index}`, date: `2026-06-${String(17 + index).padStart(2,'0')}`, durationMin: 90, rpe: 7, distanceKm: 12, elevationGainM: 500, elevationLossM: 500, terrain: 'trail'
  }));
  const result = calculateLoadTrend(activities, '2026-06-23');
  assert.ok(result.last7.totalLoad > 0);
  assert.ok(['high','moderate','normal','low','info'].includes(result.warning.level));
});

test('Apple Health payload normalizes recovery, workout and body records', () => {
  const result = normalizeAppleHealthPayload({
    schemaVersion: 1,
    source: 'apple_health',
    exportedAt: '2026-06-23T10:00:00Z',
    dailyMetrics: [{ date: '2026-06-22', sleepHours: 7.5, restingHr: 56, hrvMs: 44, steps: 12345, activeEnergyKcal: 780, exerciseMinutes: 62 }],
    activities: [{ externalId: 'workout-1', date: '2026-06-22', name: 'Hiking', type: 'Hike', durationMin: 120, distanceKm: 11.2, avgHr: 139, maxHr: 171, terrain: 'trail' }],
    bodyComposition: [{ id: 'body-1', date: '2026-06-22', weightKg: 80.0, percentBodyFat: 24 }]
  }, { athlete: { maxHr: 190 } });
  assert.equal(result.checkins[0].source, 'apple_health');
  assert.equal(result.checkins[0].steps, 12345);
  assert.equal(result.activities[0].externalId, 'apple-health:workout-1');
  assert.equal(result.activities[0].maxHrReference, 190);
  assert.equal(result.bodyComposition[0].weightKg, 80);
});

test('high daily behavior produces a readiness penalty signal', () => {
  const history = Array.from({ length: 10 }, (_, index) => ({ date: `2026-06-${String(index + 1).padStart(2, '0')}`, steps: 8000, activeEnergyKcal: 550, exerciseMinutes: 35 }));
  const result = calculateBehaviorLoad({ date: '2026-06-20', steps: 22000, activeEnergyKcal: 1300, exerciseMinutes: 160 }, history);
  assert.ok(result.score >= 85);
  assert.ok(result.penalty > 0);
  assert.ok(result.flags.includes('high_steps'));
});

test('wearable-only readiness is capped yellow until subjective pain check is completed', () => {
  const readiness = calculateReadiness({
    checkin: { date: '2026-06-23', sleepHours: 8, restingHr: 54, hrvMs: 45, source: 'apple_health' },
    checkinHistory: [], activities: [], painLogs: [], settings, dateKey: '2026-06-23'
  });
  assert.equal(readiness.status, 'yellow');
  assert.ok(readiness.score <= 69);
  assert.ok(readiness.flags.includes('missing_subjective_check'));
});

test('current and legacy InBody import schemas are accepted', () => {
  for (const schema of ['trail-runner-coach-body-composition', 'rtc70-body-composition']) {
    const result = parseBodyCompositionImport({
      schema,
      version: 1,
      profilePatch: { athlete: { age: 40, weightKg: 80 } },
      records: [{ id: 'inbody-1', date: '2026-01-01', weightKg: 80, skeletalMuscleMassKg: 34, source: 'inbody_scan' }]
    });
    assert.equal(result.records.length, 1);
    assert.equal(result.records[0].skeletalMuscleMassKg, 34);
  }
});

import { energyBalanceForDate, foodTotals, nutritionTarget } from '../public/js/core/nutrition.js';

test('nutrition totals and complete-day energy balance use food logs without hiding incomplete days', () => {
  const state = {
    settings: { athlete: { weightKg: 80, age: 34, heightCm: 175, sex: 'male' }, nutrition: { proteinTargetGPerKg: 1.8, waterBaseMlPerKg: 30 }, preferences: { nonExerciseActivityFactor: 1.2 }, selection: {} },
    bodyComposition: [], foodLogs: [
      { date: '2026-06-23', kcal: 600, proteinG: 30, carbG: 75, fatG: 20 },
      { date: '2026-06-23', kcal: 120, proteinG: 24, carbG: 3, fatG: 2 }
    ], dailyFlags: [{ date: '2026-06-23', foodComplete: true }], activities: [], checkins: [], trainingPlans: [], raceProfiles: []
  };
  const totals = foodTotals(state, '2026-06-23');
  assert.equal(totals.kcal, 720);
  assert.equal(totals.proteinG, 54);
  const target = nutritionTarget(state, '2026-06-23');
  assert.ok(target.kcal > 1500);
  const balance = energyBalanceForDate(state, '2026-06-23');
  assert.equal(balance.foodComplete, true);
  assert.equal(balance.intakeKcal, 720);
});
