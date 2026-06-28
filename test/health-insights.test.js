import test from 'node:test';
import assert from 'node:assert/strict';
import { selectAppleHealthInsights } from '../public/js/core/health-insights.js';
import { energyBalanceForDate, nutritionTarget } from '../public/js/core/nutrition.js';

function baseState() {
  return {
    settings: {
      athlete: { weightKg: 80 },
      nutrition: { bmrKcal: 1700, proteinTargetGPerKg: 1.8, waterBaseMlPerKg: 30 },
      preferences: { nonExerciseActivityFactor: 1.2 },
      selection: {}
    },
    checkins: [
      {
        date: '2026-06-27',
        source: 'apple_health',
        sources: ['apple_health'],
        sleepHours: 7.4,
        restingHr: 55,
        hrvMs: 47,
        steps: 8240,
        activeEnergyKcal: 600,
        exerciseMinutes: 52,
        walkingRunningDistanceKm: 7.8,
        wearable: { transport: 'shortcuts_bridge', importedAt: '2026-06-27T11:33:35.688Z' }
      }
    ],
    bodyComposition: [
      {
        id: 'body-1',
        date: '2026-06-27',
        weightKg: 88.9,
        percentBodyFat: 27.5,
        source: 'apple_health'
      }
    ],
    metadata: [{ id: 'apple_health_sync', lastSyncAt: '2026-06-27T11:33:35.688Z' }],
    foodLogs: [{ date: '2026-06-27', kcal: 2100, proteinG: 140, carbG: 220, fatG: 65 }],
    dailyFlags: [{ date: '2026-06-27', foodComplete: true }],
    activities: [],
    trainingPlans: [],
    raceProfiles: [],
    waterLogs: [],
    painLogs: [],
    workouts: []
  };
}

test('Apple Health insights expose visible metrics, coverage and downstream usage', () => {
  const insights = selectAppleHealthInsights(baseState(), '2026-06-27', 7);

  assert.equal(insights.hasData, true);
  assert.equal(insights.metrics.steps, 8240);
  assert.equal(insights.metrics.sleepHours, 7.4);
  assert.equal(insights.recoveryAvailable, 3);
  assert.equal(insights.behaviorAvailable, 3);
  assert.equal(insights.latestBody.weightKg, 88.9);
  assert.equal(insights.nutrition.usesAppleActiveEnergy, true);
  assert.equal(insights.trend.coverageDays, 1);
});

test('Apple Active Energy is combined with BMR without double-counting the activity factor', () => {
  const state = baseState();
  const target = nutritionTarget(state, '2026-06-27');

  assert.equal(target.restingEnergyKcal, 1700);
  assert.equal(target.activeEnergyKcal, 600);
  assert.equal(target.kcal, 2300);
  assert.equal(target.totalOutSource, 'bmr_plus_apple_active_energy');

  const balance = energyBalanceForDate(state, '2026-06-27');
  assert.equal(balance.totalOutKcal, 2300);
  assert.equal(balance.netKcal, -200);
});

test('Apple Health insights use same-date wake-day recovery without carrying yesterday movement', () => {
  const state = baseState();
  state.checkins = [
    {
      date: '2026-06-27',
      source: 'apple_health',
      sources: ['apple_health'],
      steps: 8240,
      activeEnergyKcal: 600,
      exerciseMinutes: 52,
      walkingRunningDistanceKm: 7.8,
      wearable: { transport: 'health_auto_export', importedAt: '2026-06-28T06:24:22.138Z' }
    },
    {
      date: '2026-06-28',
      source: 'apple_health',
      sources: ['apple_health'],
      sleepHours: 7.4,
      restingHr: 55,
      hrvMs: 47,
      wearable: { transport: 'health_auto_export', importedAt: '2026-06-28T06:24:22.138Z' }
    }
  ];

  const insights = selectAppleHealthInsights(state, '2026-06-28', 7);

  assert.equal(insights.hasData, true);
  assert.equal(insights.metricDate, '2026-06-28');
  assert.equal(insights.isCurrentDay, true);
  assert.equal(insights.metrics.sleepHours, 7.4);
  assert.equal(insights.metricDates.sleepHours, '2026-06-28');
  assert.equal(insights.sourceMetricDates.sleepHours, '2026-06-28');
  assert.equal(insights.metricAlignments.sleepHours, 'overnight_to_wake_day');
  assert.equal(insights.metrics.steps, null);
});

test('Apple Health insights keep fallback recovery on its actual wake date', () => {
  const state = baseState();
  state.checkins = [
    {
      date: '2026-06-27',
      source: 'apple_health',
      sources: ['apple_health'],
      sleepHours: 5.58,
      restingHr: 63,
      hrvMs: 41,
      steps: 2364,
      activeEnergyKcal: 72,
      walkingRunningDistanceKm: 1.52,
      wearable: { transport: 'health_auto_export', importedAt: '2026-06-28T06:24:22.138Z' }
    },
    {
      date: '2026-06-28',
      source: 'apple_health',
      sources: ['apple_health'],
      sleepHours: null,
      restingHr: null,
      hrvMs: null,
      steps: 352,
      activeEnergyKcal: 7.564,
      walkingRunningDistanceKm: 0.24655,
      wearable: { transport: 'health_auto_export', importedAt: '2026-06-28T06:24:22.138Z' }
    }
  ];

  const insights = selectAppleHealthInsights(state, '2026-06-28', 7);

  assert.equal(insights.metrics.steps, 352);
  assert.equal(insights.metricDates.steps, '2026-06-28');
  assert.equal(insights.metrics.sleepHours, 5.58);
  assert.equal(insights.metricDates.sleepHours, '2026-06-27');
  assert.equal(insights.sourceMetricDates.sleepHours, '2026-06-27');
  assert.equal(insights.metrics.restingHr, 63);
  assert.equal(insights.metricDates.restingHr, '2026-06-27');
  assert.equal(insights.sourceMetricDates.restingHr, '2026-06-27');
  assert.equal(insights.metrics.hrvMs, 41);
  assert.equal(insights.metricDates.hrvMs, '2026-06-27');
  assert.equal(insights.sourceMetricDates.hrvMs, '2026-06-27');
  assert.equal(insights.hasMixedMetricDates, true);
  assert.equal(insights.metricDate, '2026-06-28');
  assert.equal(insights.recoveryAvailable, 3);
});
