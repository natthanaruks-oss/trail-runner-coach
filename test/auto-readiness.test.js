import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAutoReadinessContext,
  buildReadinessDraft,
  readinessFreshnessLabel,
  resolveReadinessMetricDate,
  selectLatestReadinessMetric
} from '../public/js/core/auto-readiness.js';

const hae = { transport: 'health_auto_export', sourceBundle: 'com.healthyapps.healthautoexport' };

test('Health Auto Export recovery uses the date supplied by the wake-day feed', () => {
  const checkins = [
    { date: '2026-06-26', sleepHours: 6.1, restingHr: 59, hrvMs: 40, source: 'apple_health', wearable: hae },
    { date: '2026-06-27', sleepHours: 5.53, restingHr: 63, hrvMs: 44, source: 'apple_health', wearable: hae },
    {
      date: '2026-06-28',
      sleepHours: 7.2,
      restingHr: 56,
      steps: 352,
      activeEnergyKcal: 7.5,
      walkingRunningDistanceKm: 0.25,
      source: 'apple_health',
      wearable: hae
    }
  ];

  const context = buildAutoReadinessContext({ checkins, dateKey: '2026-06-28' });

  assert.equal(context.metrics.sleepHours.value, 7.2);
  assert.equal(context.metrics.sleepHours.sourceDate, '2026-06-28');
  assert.equal(context.metrics.sleepHours.effectiveDate, '2026-06-28');
  assert.equal(context.metrics.sleepHours.alignment, 'overnight_to_wake_day');
  assert.equal(context.metrics.sleepHours.freshness, 'fresh');
  assert.equal(context.metrics.restingHr.value, 56);
  assert.equal(context.metrics.steps.value, 352);
  assert.equal(context.metrics.hrvMs.value, 44);
  assert.equal(context.metrics.hrvMs.sourceDate, '2026-06-27');
  assert.equal(context.metrics.hrvMs.effectiveDate, '2026-06-27');
  assert.ok(context.objectiveCoveragePct > 50);
  assert.equal(context.recoveryDatePolicy, 'wake_day_v2');
});

test('Health Auto Export recovery dated today is used today', () => {
  const metric = selectLatestReadinessMetric([
    { date: '2026-06-27', sleepHours: 5.53, source: 'apple_health', wearable: hae },
    { date: '2026-06-28', sleepHours: 7.2, source: 'apple_health', wearable: hae }
  ], 'sleepHours', '2026-06-28');

  assert.equal(metric.value, 7.2);
  assert.equal(metric.sourceDate, '2026-06-28');
  assert.equal(metric.effectiveDate, '2026-06-28');
});

test('current-day movement metrics never roll yesterday values into today', () => {
  const context = buildAutoReadinessContext({
    dateKey: '2026-06-28',
    checkins: [{ date: '2026-06-27', steps: 9000, activeEnergyKcal: 600, source: 'apple_health', wearable: hae }]
  });

  assert.equal(context.metrics.steps, undefined);
  assert.equal(context.metrics.activeEnergyKcal, undefined);
  assert.ok(context.missingKeys.includes('steps'));
});

test('auto readiness excludes stale recovery values outside the safe window', () => {
  const metric = selectLatestReadinessMetric([
    { date: '2026-06-20', hrvMs: 50, source: 'apple_health', wearable: hae }
  ], 'hrvMs', '2026-06-28');

  assert.equal(metric, null);
});

test('readiness draft preserves human fields and stores wake-day recovery dates', () => {
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
    checkins: [
      existing,
      { date: '2026-06-28', sleepHours: 7.2, restingHr: 57, source: 'apple_health', wearable: hae }
    ]
  });

  assert.equal(draft.fatigue, 4);
  assert.equal(draft.sleepHours, 7.2);
  assert.equal(draft.restingHr, 57);
  assert.ok(draft.sources.includes('manual'));
  assert.ok(draft.sources.includes('apple_health'));
  assert.equal(draft.autoMetricDates.sleepHours, '2026-06-28');
  assert.equal(draft.autoMetricEffectiveDates.sleepHours, '2026-06-28');
  assert.equal(draft.autoMetricAlignments.sleepHours, 'overnight_to_wake_day');
  assert.equal(draft.autoReadiness.recoveryDatePolicy, 'wake_day_v2');
});

test('legacy v1 saved readiness does not override newly synced same-day sleep', () => {
  const legacyExisting = {
    date: '2026-06-28',
    sleepHours: 5.53,
    source: 'hybrid',
    sources: ['manual', 'apple_health'],
    autoMetricDates: { sleepHours: '2026-06-27' },
    autoMetricEffectiveDates: { sleepHours: '2026-06-28' },
    autoMetricAlignments: { sleepHours: 'overnight_to_wake_day' },
    autoReadiness: { recoveryDatePolicy: 'wake_day_v1' }
  };

  const context = buildAutoReadinessContext({
    existing: legacyExisting,
    dateKey: '2026-06-28',
    checkins: [
      legacyExisting,
      { date: '2026-06-28', sleepHours: 7.2, source: 'apple_health', wearable: hae }
    ]
  });

  assert.equal(context.metrics.sleepHours.value, 7.2);
  assert.equal(context.metrics.sleepHours.sourceDate, '2026-06-28');
  assert.equal(context.metrics.sleepHours.effectiveDate, '2026-06-28');
});

test('legacy stored plus-one effective date is repaired at read time', () => {
  const metric = selectLatestReadinessMetric([{
    date: '2026-06-28',
    sleepHours: 7.2,
    source: 'apple_health',
    wearable: hae,
    autoMetricDates: { sleepHours: '2026-06-28' },
    autoMetricEffectiveDates: { sleepHours: '2026-06-29' },
    autoMetricAlignments: { sleepHours: 'overnight_to_wake_day' },
    autoReadiness: { recoveryDatePolicy: 'wake_day_v1' }
  }], 'sleepHours', '2026-06-28');

  assert.equal(metric.value, 7.2);
  assert.equal(metric.sourceDate, '2026-06-28');
  assert.equal(metric.effectiveDate, '2026-06-28');
});

test('freshness copy explains that last-night recovery is used for the full day', () => {
  const resolved = resolveReadinessMetricDate({ wearable: hae }, 'sleepHours', '2026-06-28');
  const metric = {
    ...resolved,
    date: resolved.sourceDate,
    ageDays: 0,
    period: 'overnight',
    freshness: 'fresh'
  };

  assert.equal(readinessFreshnessLabel(metric, '2026-06-28', 'th'), 'เมื่อคืน · ใช้กับวันนี้ทั้งวัน');
  assert.equal(readinessFreshnessLabel(metric, '2026-06-28', 'en'), 'Last night · used for today');
});
