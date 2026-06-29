import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAiCoachExplanationKey,
  getHomeCoachRuntime,
  scheduleHomeCoachExplanation
} from '../public/js/core/home-coach-runtime.js';

function snapshot(overrides = {}) {
  return {
    version: 'ai_coach_snapshot_v1',
    date: '2026-06-29',
    language: 'th',
    digest: overrides.digest || 'ac1-a',
    decision: {
      actionCode: 'follow_plan',
      status: 'green',
      hardStop: false,
      suggestedType: 'Easy',
      suggestedDistanceKm: 6,
      suggestedVerticalM: 100,
      intensityCode: 'easy_controlled',
      confidence: 80,
      ...overrides.decision
    },
    plannedSession: {
      type: 'Easy',
      title: 'Easy run',
      distanceKm: 6,
      verticalM: 100,
      durationMin: 50,
      ...overrides.plannedSession
    },
    readiness: {
      score: 82,
      status: 'good',
      confidence: 85,
      ...overrides.readiness
    },
    pillars: {
      recovery: { score: 80, status: 'good' },
      load: { score: 75, status: 'balanced' },
      energy: { score: 70, status: 'good' },
      ...overrides.pillars
    },
    race: {
      stage: 'build',
      ...overrides.race
    }
  };
}

test('minor readiness score change keeps the same AI explanation key', () => {
  const first = snapshot();
  const second = snapshot({
    digest: 'ac1-b',
    readiness: { score: 84, status: 'good' }
  });

  assert.equal(
    buildAiCoachExplanationKey(first),
    buildAiCoachExplanationKey(second)
  );
});

test('material recommendation changes invalidate the key', () => {
  const first = snapshot();
  const second = snapshot({
    digest: 'ac1-c',
    decision: {
      actionCode: 'reduce_25',
      status: 'yellow',
      suggestedDistanceKm: 4.5
    }
  });

  assert.notEqual(
    buildAiCoachExplanationKey(first),
    buildAiCoachExplanationKey(second)
  );
});

test('same material key keeps prior result and marks new raw data as stale', () => {
  const current = snapshot();
  const key = buildAiCoachExplanationKey(current);
  const app = {
    ui: {
      homeAiCoach: {
        explanationKey: key,
        sourceDigest: 'ac1-old',
        result: {
          generatedAt: '2026-06-29T06:00:00.000Z',
          explanation: {
            headline: 'ทำตามแผนได้'
          }
        },
        status: 'ready'
      }
    }
  };

  const runtime = getHomeCoachRuntime(app, current);
  assert.equal(runtime.result.explanation.headline, 'ทำตามแผนได้');
  assert.equal(runtime.staleData, true);
});

test('scheduler deduplicates a pending material decision', () => {
  const current = snapshot();
  const key = buildAiCoachExplanationKey(current);
  const app = {
    ui: {
      homeAiCoach: {
        pendingKey: key,
        sequence: 1
      }
    },
    store: {
      getState() {
        return {
          settings: {
            integrations: {
              aiCoach: {
                baseUrl: 'https://worker.example',
                accessToken: 'a'.repeat(48)
              }
            }
          }
        };
      }
    }
  };

  const result = scheduleHomeCoachExplanation({
    app,
    snapshot: current,
    request: async () => {
      throw new Error('must not run');
    }
  });

  assert.equal(result.scheduled, false);
  assert.equal(result.reason, 'already_pending');
});

test('stale AI response cannot overwrite a newer recommendation', async () => {
  const first = snapshot();
  const second = snapshot({
    digest: 'ac1-new',
    decision: {
      actionCode: 'reduce_25',
      status: 'yellow',
      suggestedDistanceKm: 4.5
    }
  });

  const resolvers = [];
  const app = {
    ui: {},
    render() {},
    store: {
      getState() {
        return {
          settings: {
            integrations: {
              aiCoach: {
                baseUrl: 'https://worker.example',
                accessToken: 'a'.repeat(48)
              }
            }
          }
        };
      },
      async saveSettings() {}
    }
  };

  const request = ({ snapshot: sent }) =>
    new Promise(resolve => {
      resolvers.push({
        digest: sent.digest,
        resolve
      });
    });

  scheduleHomeCoachExplanation({
    app,
    snapshot: first,
    delayMs: 0,
    request
  });

  await new Promise(resolve => setTimeout(resolve, 5));

  scheduleHomeCoachExplanation({
    app,
    snapshot: second,
    delayMs: 0,
    request
  });

  await new Promise(resolve => setTimeout(resolve, 5));

  resolvers.find(item => item.digest === first.digest).resolve({
    generatedAt: '2026-06-29T06:00:00.000Z',
    explanation: { headline: 'old' }
  });

  resolvers.find(item => item.digest === second.digest).resolve({
    generatedAt: '2026-06-29T06:01:00.000Z',
    explanation: { headline: 'new' }
  });

  await new Promise(resolve => setTimeout(resolve, 10));

  assert.equal(
    app.ui.homeAiCoach.result.explanation.headline,
    'new'
  );
  assert.equal(
    app.ui.homeAiCoach.explanationKey,
    buildAiCoachExplanationKey(second)
  );
});
