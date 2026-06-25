import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCalibrationProfile,
  createCalibrationFeedback,
  readinessAnswerToScore
} from '../public/js/engines/calibration.js';
import { calculateReadiness } from '../public/js/engines/readiness.js';
import { calculateDailyStrain } from '../public/js/engines/strain.js';
import { inferRhrStats, inferHrvStats } from '../public/js/engines/recovery.js';

function feedbackRows(count, { predictedReadiness = 50, actualReadiness = 4, predictedStrain = 8, perceivedStrain = 10 } = {}) {
  return Array.from({ length: count }, (_, index) => createCalibrationFeedback({
    date: `2026-05-${String(index + 1).padStart(2, '0')}`,
    actualReadiness,
    perceivedStrain,
    predicted: {
      readiness: predictedReadiness,
      recovery: predictedReadiness,
      strain: predictedStrain,
      recoveryComponents: [
        { key: 'sleepHours', score: 45 + index * 2 },
        { key: 'fatigue', score: 40 + index * 2 }
      ]
    }
  }));
}

test('calibration stays in bootstrap mode before seven usable feedback days', () => {
  const state = { settings: { scoring: { calibrationEnabled: true } }, metadata: feedbackRows(6) };
  const profile = buildCalibrationProfile(state, '2026-06-01');
  assert.equal(profile.phase, 'bootstrap');
  assert.equal(profile.readinessFeedbackCount, 6);
  assert.ok(profile.confidence < 50);
});

test('twenty-one feedback days create a guarded personalized readiness offset', () => {
  const state = { settings: { scoring: { calibrationEnabled: true } }, metadata: feedbackRows(21, { predictedReadiness: 50, actualReadiness: 5 }) };
  const profile = buildCalibrationProfile(state, '2026-06-01');
  assert.equal(profile.phase, 'personalized');
  assert.equal(profile.readinessBias, 10);
  assert.ok(profile.confidence >= 80);
  assert.equal(readinessAnswerToScore(5), 95);
});

test('perceived strain learns a bounded athlete-specific offset', () => {
  const state = { settings: { scoring: { calibrationEnabled: true } }, metadata: feedbackRows(14, { predictedStrain: 6, perceivedStrain: 12 }) };
  const profile = buildCalibrationProfile(state, '2026-06-01');
  assert.equal(profile.strainBias, 2.5);
  const strain = calculateDailyStrain([], '2026-06-01', { date: '2026-06-01', steps: 12000, activeEnergyKcal: 700, exerciseMinutes: 50 }, [], profile);
  assert.ok(strain.score >= strain.rawScore);
  assert.ok(strain.calibrationAdjustment <= 2.5);
});

test('learned recovery component modifiers remain inside safety bounds', () => {
  const state = { settings: { scoring: { calibrationEnabled: true } }, metadata: feedbackRows(21) };
  const profile = buildCalibrationProfile(state, '2026-06-01');
  for (const value of Object.values(profile.componentModifiers)) {
    assert.ok(value >= 0.85 && value <= 1.15);
  }
});

test('personal calibration never overrides a hard pain safety gate', () => {
  const calibration = buildCalibrationProfile({ settings: { scoring: { calibrationEnabled: true } }, metadata: feedbackRows(21, { predictedReadiness: 40, actualReadiness: 5 }) }, '2026-06-01');
  const readiness = calculateReadiness({
    checkin: {
      date: '2026-06-01', sleepHours: 8, sleepQuality: 5, restingHr: 54, hrvMs: 50,
      fatigue: 1, stress: 1, muscleSoreness: 1, pain: { achilles: 7 }
    },
    checkinHistory: [], activities: [], painLogs: [], settings: { athlete: { restingHrBaseline: 55 } }, calibration, dateKey: '2026-06-01'
  });
  assert.equal(readiness.status, 'red');
  assert.ok(readiness.score <= 30);
});

test('rolling baselines use robust spread instead of reacting to one outlier', () => {
  const history = Array.from({ length: 12 }, (_, index) => ({
    date: `2026-05-${String(index + 1).padStart(2, '0')}`,
    restingHr: index === 11 ? 90 : 55 + (index % 3 - 1),
    hrvMs: index === 11 ? 10 : 45 + (index % 3 - 1) * 2
  }));
  const rhr = inferRhrStats(history);
  const hrv = inferHrvStats(history);
  assert.ok(rhr.median >= 54 && rhr.median <= 56);
  assert.ok(hrv.median >= 43 && hrv.median <= 47);
  assert.ok(rhr.spread >= 1.5);
  assert.ok(hrv.spread >= 2.5);
});
