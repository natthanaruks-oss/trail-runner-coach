import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAiCoachHandler
} from '../workers/ai-coach/src/index.js';

const env = {
  APP_ORIGIN: 'https://app.example',
  WORKERS_AI_MODEL: '@cf/qwen/qwen3-30b-a3b-fp8',
  AI_COACH_ACCESS_TOKEN: 'a'.repeat(48),
  AI: {
    run: async () => {
      throw new Error('Test must inject runModel');
    }
  }
};

const snapshot = {
  version: 'ai_coach_snapshot_v1',
  date: '2026-06-29',
  language: 'th',
  digest: 'ac1-test0001',
  decision: {
    actionCode: 'follow_plan',
    status: 'green',
    hardStop: false,
    safeToEscalate: false,
    suggestedType: 'Easy',
    suggestedDistanceKm: 5,
    suggestedVerticalM: 80,
    intensityCode: 'planned',
    confidence: 80,
    reasons: [],
    missing: []
  },
  privacy: {
    rawHealthRowsExcluded: true,
    directIdentityExcluded: true,
    secretsExcluded: true
  }
};

function request(body = snapshot, token = env.AI_COACH_ACCESS_TOKEN) {
  return new Request(
    'https://worker.example/v1/explain',
    {
      method: 'POST',
      headers: {
        Origin: env.APP_ORIGIN,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ snapshot: body })
    }
  );
}

function validExplanation(overrides = {}) {
  return {
    actionCodeEcho: 'follow_plan',
    statusEcho: 'green',
    safetyLockEcho: false,
    headline: 'ทำตามแผนได้',
    summary:
      'สัญญาณปัจจุบันสนับสนุน Easy session ตามแผน',
    todayPlan: 'Easy 5 km และ Vertical 80 m',
    why: [
      'Recovery และ Readiness อยู่ในระดับสนับสนุนแผน'
    ],
    watchFor: ['อย่าเพิ่มความหนักนอกแผน'],
    checkAfter: 'ประเมินความรู้สึกหลัง 10 นาทีแรก',
    safetyNote:
      'หยุดหากมี Pain หรืออาการผิดปกติ',
    ...overrides
  };
}

test('Workers AI returns structured explanation with the configured model', async () => {
  let calledModel;
  let calledInput;

  const handler = createAiCoachHandler({
    runModel: async (model, input) => {
      calledModel = model;
      calledInput = input;
      return {
        response: validExplanation()
      };
    }
  });

  const response = await handler(request(), env);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.provider, 'cloudflare-workers-ai');
  assert.equal(body.explanation.actionCodeEcho, 'follow_plan');
  assert.equal(
    calledModel,
    '@cf/qwen/qwen3-30b-a3b-fp8'
  );
  assert.equal(
    calledInput.response_format.type,
    'json_schema'
  );
  assert.equal(calledInput.stream, false);
});

test('Workers AI string JSON response is parsed safely', async () => {
  const handler = createAiCoachHandler({
    runModel: async () => ({
      response: JSON.stringify(validExplanation())
    })
  });

  const response = await handler(request(), env);
  assert.equal(response.status, 200);
});

test('Worker rejects wrong bearer token before calling AI', async () => {
  let called = false;

  const handler = createAiCoachHandler({
    runModel: async () => {
      called = true;
      return { response: validExplanation() };
    }
  });

  const response = await handler(
    request(snapshot, 'wrong-token'),
    env
  );

  assert.equal(response.status, 401);
  assert.equal(called, false);
});

test('Worker rejects an explanation that changes the Local Coach action', async () => {
  const handler = createAiCoachHandler({
    runModel: async () => ({
      response: validExplanation({
        actionCodeEcho: 'reduce_25',
        statusEcho: 'yellow'
      })
    })
  });

  const response = await handler(request(), env);
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.match(
    body.error,
    /changed the Local Coach action/
  );
});

test('Worker refuses raw health data', async () => {
  const handler = createAiCoachHandler({
    runModel: async () => ({
      response: validExplanation()
    })
  });

  const response = await handler(
    request({
      ...snapshot,
      privacy: {
        ...snapshot.privacy,
        rawHealthRowsExcluded: false
      }
    }),
    env
  );

  assert.equal(response.status, 400);
});

test('Worker requires a Workers AI binding', async () => {
  const handler = createAiCoachHandler();

  const response = await handler(
    request(),
    {
      ...env,
      AI: undefined
    }
  );

  assert.equal(response.status, 503);
});
