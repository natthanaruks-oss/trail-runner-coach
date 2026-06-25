import test from 'node:test';
import assert from 'node:assert/strict';
import {
  prepareActivityImport,
  reconcileActivityDuplicates,
  scoreActivityMatch
} from '../public/js/core/activity-dedup.js';

const apple = {
  id: 'activity-apple-1',
  externalId: 'apple-health:workout-1',
  source: 'apple_health',
  date: '2026-06-24',
  startTime: '2026-06-24T10:00:00Z',
  name: 'Outdoor Run',
  type: 'Running',
  durationMin: 90,
  distanceKm: 12,
  elevationGainM: 0,
  elevationLossM: 0,
  avgHr: 145,
  activeEnergyKcal: 900,
  terrain: 'road'
};

const strava = {
  id: 'activity-strava-99',
  externalId: 'strava:99',
  source: 'strava',
  date: '2026-06-24',
  startTime: '2026-06-24T10:02:00Z',
  name: 'Morning Trail Run',
  type: 'TrailRun',
  durationMin: 92,
  distanceKm: 12.1,
  elevationGainM: 620,
  elevationLossM: 610,
  avgHr: 147,
  rpe: 7,
  terrain: 'trail'
};

test('Apple Health and Strava copies of one workout merge into one canonical activity', () => {
  const match = scoreActivityMatch(apple, strava);
  assert.equal(match.decision, 'merge');
  assert.ok(match.score >= 72);

  const result = prepareActivityImport([apple], [strava], { provider: 'strava' });
  assert.equal(result.records.length, 1);
  assert.equal(result.summary.merged, 1);
  assert.deepEqual(new Set(result.records[0].sources), new Set(['apple_health', 'strava']));
  assert.equal(result.records[0].source, 'hybrid');
  assert.equal(result.records[0].elevationGainM, 620);
  assert.equal(result.records[0].activeEnergyKcal, 900);
  assert.equal(result.records[0].rpe, 7);
});

test('same provider and external ID update the existing record instead of adding a duplicate', () => {
  const update = { ...strava, id: 'another-id', durationMin: 95, distanceKm: 12.4 };
  const result = prepareActivityImport([strava], [update], { provider: 'strava' });
  assert.equal(result.records.length, 1);
  assert.equal(result.summary.updated, 1);
  assert.equal(result.records[0].id, strava.id);
  assert.equal(result.records[0].durationMin, 95);
  assert.equal(result.records[0].distanceKm, 12.4);
});

test('two different workouts on the same date are not merged when start times are far apart', () => {
  const evening = { ...strava, id: 'evening', externalId: 'strava:100', startTime: '2026-06-24T18:00:00Z' };
  const result = prepareActivityImport([apple], [evening]);
  assert.equal(result.records.length, 2);
  assert.equal(result.summary.merged, 0);
});

test('an uncertain candidate is retained separately for user review', () => {
  const uncertain = {
    ...strava,
    id: 'uncertain',
    externalId: 'strava:101',
    startTime: '2026-06-24T10:14:00Z',
    durationMin: 108,
    distanceKm: 13.2,
    avgHr: null
  };
  const match = scoreActivityMatch(apple, uncertain);
  assert.equal(match.decision, 'review');
  const result = prepareActivityImport([apple], [uncertain]);
  assert.equal(result.records.length, 2);
  assert.equal(result.summary.review, 1);
  assert.equal(result.records.find(item => item.id === 'uncertain').dedup.status, 'review');
});

test('historical reconciliation removes already-stored cross-provider duplicates', () => {
  const result = reconcileActivityDuplicates([apple, strava]);
  assert.equal(result.records.length, 1);
  assert.equal(result.summary.merged, 1);
  assert.equal(result.removedIds.length, 1);
});

test('an exact Strava refresh updates Strava-owned fields without replacing better Apple Health energy', () => {
  const first = prepareActivityImport([apple], [strava]).records[0];
  const refreshedStrava = { ...strava, id: 'new-strava-id', elevationGainM: 700, activeEnergyKcal: 650 };
  const result = prepareActivityImport([first], [refreshedStrava]);
  assert.equal(result.records.length, 1);
  assert.equal(result.summary.updated, 1);
  assert.equal(result.records[0].elevationGainM, 700);
  assert.equal(result.records[0].activeEnergyKcal, 900);
});

test('a user keep-separate decision prevents a later reconciliation from merging the pair', () => {
  const kept = {
    ...strava,
    id: 'kept-strava',
    dedup: { status: 'kept_separate', keptSeparateFrom: [apple.id] }
  };
  const match = scoreActivityMatch(apple, kept);
  assert.equal(match.decision, 'none');
  assert.ok(match.reasons.includes('user_kept_separate'));
  const result = reconcileActivityDuplicates([apple, kept]);
  assert.equal(result.records.length, 2);
  assert.equal(result.summary.merged, 0);
});
