import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAutoReadinessContext, buildReadinessDraft, selectLatestReadinessMetric } from '../public/js/core/auto-readiness.js';

test('auto readiness uses the latest usable value per metric without inventing missing values', () => {
  const checkins = [
    { date: '2026-06-26', sleepHours: 6.1, restingHr: 59, hrvMs: 44, source: 'apple_health' },
    { date: '2026-06-27', sleepHours: 5.7, restingHr: 63, hrvMs: null, source: 'apple_health' },
    { date: '2026-06-28', steps: 352, activeEnergyKcal: 7.5, walkingRunningDistanceKm: 0.25, source: 'apple_health' }
  ];
  const context = buildAutoReadinessContext({ checkins, dateKey: '2026-06-28' });
  assert.equal(context.metrics.sleepHours.value, 5.7);
  assert.equal(context.metrics.sleepHours.date, '2026-06-27');
  assert.equal(context.metrics.restingHr.value, 63);
  assert.equal(context.metrics.steps.value, 352);
  assert.equal(context.metrics.hrvMs.value, 44);
  assert.equal(context.metrics.hrvMs.date, '2026-06-26');
  assert.ok(context.objectiveCoveragePct > 50);
});

test('auto readiness excludes stale recovery values outside the safe window', () => {
  const metric = selectLatestReadinessMetric([
    { date: '2026-06-20', hrvMs: 50, source: 'apple_health' }
  ], 'hrvMs', '2026-06-28');
  assert.equal(metric, null);
});

test('readiness draft preserves human check-in fields and adds synced objective metrics', () => {
  const existing = {
    date: '2026-06-28',
    fatigue: 4,
    stress: 3,
    muscleSoreness: 2,
    pain: { itb: 1, achilles: 0, plantar: 0, other: 0 },
    source: 'manual',
    sources: ['manual']
  };
  const { draft } = buildReadinessDraft({
    existing,
    dateKey: '2026-06-28',
    checkins: [existing, { date: '2026-06-27', sleepHours: 6.2, restingHr: 57, source: 'apple_health' }]
  });
  assert.equal(draft.fatigue, 4);
  assert.equal(draft.sleepHours, 6.2);
  assert.equal(draft.restingHr, 57);
  assert.ok(draft.sources.includes('manual'));
  assert.ok(draft.sources.includes('apple_health'));
  assert.equal(draft.autoMetricDates.sleepHours, '2026-06-27');
});
