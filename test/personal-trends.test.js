import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMetricBaseline, buildSleepDebt, buildSleepConsistency, buildAssociations, buildFitnessFatigueForm, buildPersonalTrends } from '../public/js/core/personal-trends.js';

const healthRows = [
  { date:'2026-06-20', sleepHours:7.5, restingHr:55, hrvMs:52 },
  { date:'2026-06-21', sleepHours:7.2, restingHr:56, hrvMs:50 },
  { date:'2026-06-22', sleepHours:7.4, restingHr:55, hrvMs:51 },
  { date:'2026-06-23', sleepHours:7.1, restingHr:56, hrvMs:49 },
  { date:'2026-06-24', sleepHours:7.3, restingHr:55, hrvMs:50 },
  { date:'2026-06-25', sleepHours:6.9, restingHr:57, hrvMs:47 },
  { date:'2026-06-26', sleepHours:6.8, restingHr:57, hrvMs:46 },
  { date:'2026-06-27', sleepHours:5.5, restingHr:63, hrvMs:38 },
  { date:'2026-06-28', sleepHours:null, restingHr:null, hrvMs:null }
];

test('personal baseline excludes the latest observation when enough history exists', () => {
  const metric = buildMetricBaseline(healthRows, { key:'restingHr', direction:'lower', precision:0, minBand:2 });
  assert.equal(metric.latestValue, 63);
  assert.equal(metric.latestDate, '2026-06-27');
  assert.ok(metric.baseline < 60);
  assert.equal(metric.status, 'risk');
  assert.ok(metric.upper < 63);
});

test('sleep debt reports an observed seven-day gap without inventing missing nights', () => {
  const debt = buildSleepDebt(healthRows, 7.5);
  assert.equal(debt.windowDays, 7);
  assert.equal(debt.observedDays, 6);
  assert.ok(debt.netDebtHours > 3);
  assert.ok(['watch','high'].includes(debt.status));
});

test('fitness fatigue and form use transparent 42 and 7 day exponential load averages', () => {
  const activities = Array.from({ length: 14 }, (_, index) => ({
    id:`a-${index}`,
    date:`2026-06-${String(15 + index).padStart(2,'0')}`,
    durationMin:index > 9 ? 120 : 45,
    rpe:index > 9 ? 8 : 4,
    distanceKm:index > 9 ? 18 : 6,
    elevationGainM:index > 9 ? 900 : 120,
    terrain:'trail'
  }));
  const load = buildFitnessFatigueForm(activities, '2026-06-28', 90);
  assert.equal(load.series.length, 90);
  assert.ok(load.fatigue > load.fitness);
  assert.ok(load.form < 0);
  assert.equal(load.method, 'ewma_42_7');
});

test('personal trends combine baseline, sleep debt, load and data confidence', () => {
  const model = buildPersonalTrends({ healthRows, activities:[], endDateKey:'2026-06-28', rangeDays:28, sleepTargetHours:7.5 });
  assert.equal(model.rangeDays, 28);
  assert.equal(model.baselines.sleepHours.latestValue, 5.5);
  assert.equal(model.baselines.restingHr.status, 'risk');
  assert.ok(model.sleepDebt.netDebtHours > 0);
  assert.ok(model.confidence >= 0 && model.confidence <= 100);
});


test('sleep consistency scores duration variability without claiming bedtime consistency', () => {
  const consistency = buildSleepConsistency(healthRows);
  assert.ok(consistency.observedDays >= 8);
  assert.ok(consistency.score >= 0 && consistency.score <= 100);
  assert.ok(['consistent','variable','irregular'].includes(consistency.status));
});

test('observed associations require paired samples and return bounded coefficients', () => {
  const associations = buildAssociations(healthRows);
  assert.ok(associations.sleepVsRhr.sampleCount >= 5);
  assert.ok(associations.sleepVsRhr.coefficient >= -1 && associations.sleepVsRhr.coefficient <= 1);
  assert.ok(associations.sleepVsHrv.coefficient >= -1 && associations.sleepVsHrv.coefficient <= 1);
});
