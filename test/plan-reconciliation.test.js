import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateActivities,
  buildActivityBundles,
  buildPlanReconciliation,
  scorePlanActivityMatch,
  workoutFromActivityMatch
} from '../public/js/core/plan-reconciliation.js';

function planState(activities = [], workouts = [], firstDay = { day: 'Sun', t: 'Easy', title: { th: 'Easy Run', en: 'Easy Run' }, km: 10, vert: 100 }) {
  return {
    settings: { selection: { activeRaceId: 'race-1', activePlanId: 'plan-1' } },
    raceProfiles: [{ id: 'race-1', status: 'upcoming' }],
    trainingPlans: [{
      id: 'plan-1', raceId: 'race-1', status: 'active', startDate: '2026-06-28', weeks: [{ id: 'w1', phase: 'Base', days: [
        firstDay,
        { day: 'Mon', t: 'Rest', km: 0, vert: 0 },
        { day: 'Tue', t: 'Strength', km: 0, vert: 0 },
        { day: 'Wed', t: 'Rest', km: 0, vert: 0 },
        { day: 'Thu', t: 'Rest', km: 0, vert: 0 },
        { day: 'Fri', t: 'Rest', km: 0, vert: 0 },
        { day: 'Sat', t: 'Rest', km: 0, vert: 0 }
      ] }]
    }],
    activities,
    workouts,
    metadata: []
  };
}

const activity = {
  id: 'activity-1', date: '2026-06-28', startTime: '2026-06-28T06:00:00+07:00', name: 'Morning Easy Run', type: 'Run',
  durationMin: 82, distanceKm: 9.7, elevationGainM: 115, elevationLossM: 110,
  avgHr: 142, maxHr: 168, terrain: 'road', source: 'strava'
};

test('same-day compatible activity receives a high-confidence plan match', () => {
  const session = { id: 'plan-1:w1-0', date: '2026-06-28', t: 'Easy', title: { en: 'Easy Run' }, km: 10, vert: 100 };
  const match = scorePlanActivityMatch(session, activity);
  assert.ok(match.score >= 80);
  const workout = workoutFromActivityMatch(session, activity, match, '2026-06-28T10:00:00.000Z');
  assert.equal(workout.status, 'completed');
  assert.equal(workout.actualActivityId, 'activity-1');
  assert.deepEqual(workout.actualActivityIds, ['activity-1']);
  assert.equal(workout.isSplitSession, false);
  assert.ok(workout.completionPct >= 90);
});

test('plan reconciliation auto-completes a high-confidence synced workout', () => {
  const result = buildPlanReconciliation(planState([activity]), { dateKey: '2026-06-28' });
  assert.equal(result.summary.autoMatched, 1);
  assert.equal(result.records[0].status, 'completed');
  assert.equal(result.records[0].actualDistanceKm, 9.7);
});

test('a clearly over-plan workout is classified as exceeded', () => {
  const session = { id: 'plan-1:w1-0', date: '2026-06-28', t: 'Easy', title: { en: 'Easy Run' }, km: 10, vert: 100 };
  const over = { ...activity, distanceKm: 14, durationMin: 95, elevationGainM: 180 };
  const match = scorePlanActivityMatch(session, over);
  const workout = workoutFromActivityMatch(session, over, match);
  assert.equal(workout.status, 'exceeded');
  assert.equal(workout.completionPct, 140);
});

test('manual workout decisions are protected from automatic overwrite', () => {
  const manual = [{ planSessionId: 'plan-1:w1-0', status: 'skipped', source: 'manual', date: '2026-06-28' }];
  const result = buildPlanReconciliation(planState([activity], manual), { dateKey: '2026-06-28' });
  assert.equal(result.records.length, 0);
});

test('morning and evening runs can reconcile to one planned long run', () => {
  const morning = {
    id: 'run-am', date: '2026-06-28', startTime: '2026-06-28T06:00:00+07:00', name: 'Morning Trail Run', type: 'Trail Run',
    durationMin: 95, distanceKm: 12, elevationGainM: 480, elevationLossM: 470, avgHr: 145, maxHr: 171, terrain: 'trail', rpe: 6
  };
  const evening = {
    id: 'run-pm', date: '2026-06-28', startTime: '2026-06-28T17:30:00+07:00', name: 'Evening Easy Run', type: 'Run',
    durationMin: 60, distanceKm: 8, elevationGainM: 250, elevationLossM: 245, avgHr: 135, maxHr: 158, terrain: 'trail', rpe: 4
  };
  const longDay = { day: 'Sun', t: 'Long', title: { th: 'Long Run', en: 'Long Run' }, km: 20, vert: 700, durationMin: 160 };
  const result = buildPlanReconciliation(planState([morning, evening], [], longDay), { dateKey: '2026-06-28' });
  assert.equal(result.records.length, 1);
  const workout = result.records[0];
  assert.equal(workout.isSplitSession, true);
  assert.equal(workout.activityCount, 2);
  assert.deepEqual(workout.actualActivityIds, ['run-am', 'run-pm']);
  assert.equal(workout.actualDistanceKm, 20);
  assert.equal(workout.durationMin, 155);
  assert.equal(workout.actualElevationGainM, 730);
  assert.equal(workout.volumeCompletionPct, 100);
  assert.equal(workout.continuousCompletionPct, 60);
  assert.ok(workout.specificityPct < 100);
  assert.equal(workout.continuousObjectiveStatus, 'partially_achieved');
  assert.equal(result.summary.linkedActivities, 2);
});

test('duration-weighted heart rate is used for a combined session', () => {
  const combined = aggregateActivities([
    { id: 'a', date: '2026-06-28', type: 'Run', durationMin: 30, distanceKm: 5, avgHr: 120, maxHr: 150 },
    { id: 'b', date: '2026-06-28', type: 'Run', durationMin: 60, distanceKm: 8, avgHr: 150, maxHr: 175 }
  ]);
  assert.equal(combined.durationMin, 90);
  assert.equal(combined.distanceKm, 13);
  assert.equal(combined.avgHr, 140);
  assert.equal(combined.maxHr, 175);
});

test('run and strength activities are never combined into one run session', () => {
  const session = { id: 'plan-1:w1-0', date: '2026-06-28', t: 'Long', title: { en: 'Long Run' }, km: 15, vert: 400 };
  const bundles = buildActivityBundles(session, [
    { id: 'run', date: '2026-06-28', type: 'Run', durationMin: 70, distanceKm: 10, elevationGainM: 250 },
    { id: 'gym', date: '2026-06-28', type: 'Strength', durationMin: 45, distanceKm: 0, elevationGainM: 0 }
  ]);
  assert.equal(bundles.length, 0);
});

test('one synced activity cannot be assigned to more than one planned session', () => {
  const result = buildPlanReconciliation(planState([activity]), { dateKey: '2026-06-28' });
  const linkedIds = result.records.flatMap(item => item.actualActivityIds);
  assert.equal(linkedIds.length, new Set(linkedIds).size);
});
