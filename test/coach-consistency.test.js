import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLoadBalance } from '../public/js/core/unified-insights.js';
import { buildDailyTrainingPrescription } from '../public/js/core/trail-coach.js';

function buildPrescription(load) {
  return buildDailyTrainingPrescription({
    plannedSession: {
      t: 'Easy',
      title: { th: 'Easy recovery', en: 'Easy recovery' },
      km: 5,
      vert: 80
    },
    readiness: { score: 94, confidence: 75 },
    recovery: { score: 90, confidence: 85 },
    load,
    energy: { score: 82 },
    pain: { hardStop: false, caution: false },
    checkinComplete: true,
    longRun: { score: 75, confidence: 70 },
    race: { confidence: 70 },
    elevationLoad: { status: 'general' },
    freshness: { staleRecoveryMetrics: false }
  });
}

test('an 81 percent load drop is underload, not a load spike', () => {
  const load = buildLoadBalance({
    trendRatio: 0.42,
    weekChangePct: -81,
    last7: { totalLoad: 120 }
  });

  assert.equal(load.status, 'underload');
  assert.equal(load.labelCode, 'load_below_recent');

  const result = buildPrescription(load);

  assert.equal(result.actionCode, 'follow_plan');
  assert.equal(result.suggestedDistanceKm, 5);
  assert.equal(result.suggestedVerticalM, 80);
});

test('a positive load spike still reduces an easy session', () => {
  const load = buildLoadBalance({
    trendRatio: 1.6,
    weekChangePct: 55,
    last7: { totalLoad: 2200 }
  });

  assert.equal(load.status, 'risk');
  assert.equal(load.labelCode, 'load_spike');

  const result = buildPrescription(load);

  assert.equal(result.actionCode, 'reduce_25');
  assert.equal(result.suggestedDistanceKm, 3.8);
  assert.equal(result.suggestedVerticalM, 52);
});
