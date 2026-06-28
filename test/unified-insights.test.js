import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUnifiedInsights, buildLoadBalance, buildEnergyScore } from '../public/js/core/unified-insights.js';

function fixture() {
  return {
    today: {
      readiness: { score: 68, status: 'yellow', confidence: 72, pain: { caution: false, hardStop: false } },
      recovery: { score: 64, confidence: 80 },
      strain: { score: 8.4, normalizedScore: 40, classification: { level: 'high' }, behaviorLoad: { score: 72 } },
      loadTrend: { trendRatio: 1.12, weekChangePct: 18, last7: { totalLoad: 1800 } },
      plan: { todaySession: { t: 'Easy' } }
    },
    health: {
      hasData: true,
      metrics: { sleepHours: 5.8, restingHr: 63, hrvMs: 41, steps: 6400, activeEnergyKcal: 420, walkingRunningDistanceKm: 4.8 },
      metricDates: { sleepHours: '2026-06-27', restingHr: '2026-06-27', hrvMs: '2026-06-27', steps: '2026-06-28', activeEnergyKcal: '2026-06-28', walkingRunningDistanceKm: '2026-06-28' },
      recoveryAvailable: 3,
      behaviorAvailable: 2,
      trend: { coverageDays: 7, days: 7 },
      rows: [
        { date: '2026-06-22', sleepHours: 7.1, restingHr: 56, hrvMs: 50, steps: 7200, activeEnergyKcal: 510, walkingRunningDistanceKm: 5.1 },
        { date: '2026-06-23', sleepHours: 6.9, restingHr: 57, hrvMs: 48, steps: 6900, activeEnergyKcal: 480, walkingRunningDistanceKm: 4.7 },
        { date: '2026-06-24', sleepHours: 7.0, restingHr: 56, hrvMs: 49, steps: 7100, activeEnergyKcal: 500, walkingRunningDistanceKm: 5.0 },
        { date: '2026-06-25', sleepHours: 6.8, restingHr: 57, hrvMs: 47, steps: 6800, activeEnergyKcal: 470, walkingRunningDistanceKm: 4.6 },
        { date: '2026-06-26', sleepHours: 6.7, restingHr: 58, hrvMs: 46, steps: 7000, activeEnergyKcal: 490, walkingRunningDistanceKm: 4.9 },
        { date: '2026-06-27', sleepHours: 5.8, restingHr: 63, hrvMs: 41, steps: 6200, activeEnergyKcal: 400, walkingRunningDistanceKm: 4.4 },
        { date: '2026-06-28', sleepHours: null, restingHr: null, hrvMs: null, steps: 6400, activeEnergyKcal: 420, walkingRunningDistanceKm: 4.8 }
      ],
      lastImportedAt: '2026-06-28T06:24:22.138Z'
    },
    scoreHistory: [
      { readiness: 76, recovery: 78, strain: 6 },
      { readiness: 74, recovery: 76, strain: 7 },
      { readiness: 72, recovery: 73, strain: 8 },
      { readiness: 69, recovery: 68, strain: 9 },
      { readiness: 68, recovery: 64, strain: 8.4 }
    ],
    nutritionBalance: { foodComplete: true, netKcal: -350 },
    nutritionTarget: { kcal: 2600 }
  };
}

test('unified insights organize data by athlete outcome instead of provider', () => {
  const model = buildUnifiedInsights(fixture());
  assert.equal(model.readiness.score, 68);
  assert.equal(model.pillars.recovery.score, 64);
  assert.ok(model.pillars.load.score >= 50);
  assert.ok(model.pillars.energy.score >= 0 && model.pillars.energy.score <= 100);
  assert.equal(model.metrics.find(item => item.key === 'sleepHours').value, 5.8);
  assert.equal(model.metrics.find(item => item.key === 'steps').value, 6400);
  assert.equal('source' in model, false);
});

test('sleep and resting heart rate contributors explain a reduced-load recommendation', () => {
  const model = buildUnifiedInsights(fixture());
  assert.ok(model.contributors.some(item => item.code === 'short_sleep'));
  assert.ok(model.contributors.some(item => item.code === 'rhr_elevated'));
  assert.equal(model.coach.actionCode, 'reduce_load');
});

test('load balance and energy scores stay bounded and transparent', () => {
  assert.deepEqual(buildLoadBalance({ trendRatio: 1, weekChangePct: 0, last7: { totalLoad: 1000 } }).status, 'balanced');
  assert.equal(buildLoadBalance({ trendRatio: 1.8, weekChangePct: 50, last7: { totalLoad: 2000 } }).status, 'risk');
  const energy = buildEnergyScore({
    recoveryScore: 80,
    today: { strain: { behaviorLoad: { score: 60 } } },
    health: { metrics: { activeEnergyKcal: 500 } },
    nutritionBalance: { foodComplete: true, netKcal: -200 },
    nutritionTarget: { kcal: 2500 }
  });
  assert.ok(energy.score >= 75);
  assert.ok(energy.components.some(item => item.key === 'recovery'));
  assert.ok(energy.components.some(item => item.key === 'fuel'));
});
