import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAiCoachSnapshot,
  digestSnapshot
} from '../public/js/core/ai-coach-snapshot.js';

test('AI Coach snapshot contains only summarized decision data', () => {
  const snapshot = buildAiCoachSnapshot({
    today: {
      dateKey: '2026-06-29',
      readiness: { pain: { hardStop: false } },
      plan: {
        todaySession: {
          t: 'Easy',
          title: { th: 'Easy recovery', en: 'Easy recovery' },
          km: 5,
          vert: 80
        }
      }
    },
    unified: {
      readiness: { score: 94, status: 'green', confidence: 75 },
      pillars: {
        recovery: { score: 90, status: 'good', confidence: 80 },
        load: { score: 65, status: 'underload', weekChangePct: -81 },
        energy: { score: 82, status: 'good' }
      }
    },
    trailCoach: {
      prescription: {
        actionCode: 'follow_plan',
        suggestedType: 'Easy',
        suggestedDistanceKm: 5,
        suggestedVerticalM: 80,
        intensityCode: 'planned',
        confidence: 81,
        reasons: [{ code: 'signals_support_plan', tone: 'good' }],
        missing: [],
        hardStop: false
      }
    },
    language: 'th'
  });

  assert.equal(snapshot.plannedSession.title, 'Easy recovery');
  assert.equal(snapshot.decision.actionCode, 'follow_plan');
  assert.equal(snapshot.pillars.load.weekChangePct, -81);
  assert.equal(snapshot.privacy.rawHealthRowsExcluded, true);
  assert.equal(snapshot.privacy.directIdentityExcluded, true);
  assert.equal(snapshot.privacy.secretsExcluded, true);
  assert.match(snapshot.digest, /^ac1-[0-9a-f]{8}$/);

  const keys = collectKeys(snapshot);
  for (const forbidden of [
    'email',
    'accessToken',
    'apiKey',
    'healthRows',
    'rawHealthRows',
    'samples',
    'workoutStreams'
  ]) {
    assert.equal(keys.has(forbidden), false, `forbidden key: ${forbidden}`);
  }
});

test('snapshot digest is deterministic', () => {
  const value = { b: 2, a: { d: 4, c: 3 } };
  assert.equal(digestSnapshot(value), digestSnapshot({ a: { c: 3, d: 4 }, b: 2 }));
});

test('hard stop is preserved in the AI snapshot', () => {
  const snapshot = buildAiCoachSnapshot({
    today: {
      dateKey: '2026-06-29',
      readiness: { pain: { hardStop: true } },
      plan: { todaySession: { t: 'Tempo', km: 10, vert: 200 } }
    },
    trailCoach: {
      prescription: {
        actionCode: 'rest_assess',
        hardStop: true,
        confidence: 95
      }
    }
  });

  assert.equal(snapshot.decision.hardStop, true);
  assert.equal(snapshot.decision.status, 'red');
  assert.equal(snapshot.decision.safeToEscalate, false);
});


function collectKeys(value, keys = new Set()) {
  if (!value || typeof value !== 'object') return keys;

  for (const [key, nested] of Object.entries(value)) {
    keys.add(key);
    collectKeys(nested, keys);
  }

  return keys;
}
