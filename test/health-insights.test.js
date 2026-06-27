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
      { id: 'body-1', date: '2026-06-27', weightKg: 88.9, percentBodyFat: 27.5, source: 'apple_health' }
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
