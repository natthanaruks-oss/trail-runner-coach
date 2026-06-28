import test from 'node:test';
import assert from 'node:assert/strict';
import { selectToday } from '../public/js/core/selectors.js';

test('Today computes an automatic readiness preview from last-night Health Auto Export data without requiring a saved check-in', () => {
  const state = {
    settings: {
      athlete: { sleepTargetHours: 7.5, restingHrBaseline: 55 },
      selection: {},
      scoring: { calibrationEnabled: true }
    },
    checkins: [
      {
        date: '2026-06-27',
        source: 'apple_health',
        sources: ['apple_health'],
        sleepHours: 6.4,
        restingHr: 58,
        hrvMs: 42,
        wearable: { transport: 'health_auto_export', sourceBundle: 'com.healthyapps.healthautoexport' }
      },
      {
        date: '2026-06-28',
        source: 'apple_health',
        sources: ['apple_health'],
        steps: 352,
        activeEnergyKcal: 7.5,
        walkingRunningDistanceKm: 0.25,
        wearable: { transport: 'health_auto_export', sourceBundle: 'com.healthyapps.healthautoexport' }
      }
    ],
    activities: [],
    painLogs: [],
    metadata: [],
    raceProfiles: [],
    trainingPlans: []
  };

  const today = selectToday(state, '2026-06-28');
  assert.equal(today.checkin?.date, '2026-06-28');
  assert.equal(today.readinessCheckin.sleepHours, 6.4);
  assert.equal(today.readinessCheckin.autoMetricDates.sleepHours, '2026-06-27');
  assert.equal(today.readinessCheckin.autoMetricEffectiveDates.sleepHours, '2026-06-28');
  assert.equal(today.autoReadinessContext.recoveryDatePolicy, 'wake_day_v1');
  assert.ok(today.readiness);
  assert.ok(today.recovery);
});
