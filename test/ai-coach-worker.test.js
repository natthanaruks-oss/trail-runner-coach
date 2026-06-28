import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAiCoachHandler
} from '../workers/ai-coach/src/index.js';

const env = {
  APP_ORIGIN: 'https://app.example',
  OPENAI_MODEL: 'gpt-5.4-mini',
  OPENAI_API_KEY: 'sk-test-secret',
  AI_COACH_ACCESS_TOKEN: 'a'.repeat(48)
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

function request(body = snapshot) {
  return new Request('https://worker.example/v1/explain', {
    method: 'POST',
    headers: {
      Origin: env.APP_ORIGIN,
      Authorization: `Bearer ${env.AI_COACH_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ snapshot: body })
  });
}

test('AI Coach Worker returns structured explanation and does not store responses', async () => {
  let openAiRequest;

  const handler = createAiCoachHandler({
    fetchImpl: async (_url, init) => {
      openAiRequest = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            actionCodeEcho: 'follow_plan',
            statusEcho: 'green',
            safetyLockEcho: false,
            headline: 'ทำตามแผนได้',
            summary: 'สัญญาณปัจจุบันสนับสนุน Easy session ตามแผน',
            todayPlan: 'Easy 5 km และ Vertical 80 m',
            why: ['Recovery และ Readiness อยู่ในระดับสนับสนุนแผน'],
            watchFor: ['อย่าเพิ่มความหนักนอกแผน'],
            checkAfter: 'ประเมินความรู้สึกหลัง 10 นาทีแรก',
            safetyNote: 'หยุดหากมี Pain หรืออาการผิดปกติ'
          })
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
  });

  const response = await handler(request(), env);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.explanation.actionCodeEcho, 'follow_plan');
  assert.equal(openAiRequest.store, false);
  assert.equal(openAiRequest.model, 'gpt-5.4-mini');
  assert.equal(openAiRequest.text.format.type, 'json_schema');
  assert.doesNotMatch(JSON.stringify(openAiRequest.input), /sk-test-secret/);
});

test('AI Coach Worker rejects wrong bearer token', async () => {
  const handler = createAiCoachHandler({
    fetchImpl: async () => {
      throw new Error('must not call OpenAI');
    }
  });

  const badRequest = new Request('https://worker.example/v1/explain', {
    method: 'POST',
    headers: {
      Origin: env.APP_ORIGIN,
      Authorization: 'Bearer wrong-token',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ snapshot })
  });

  const response = await handler(badRequest, env);
  assert.equal(response.status, 401);
});

test('AI Coach Worker rejects an output that changes the action', async () => {
  const handler = createAiCoachHandler({
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            actionCodeEcho: 'reduce_25',
            statusEcho: 'yellow',
            safetyLockEcho: false,
            headline: 'เพิ่มงาน',
            summary: 'ผิด',
            todayPlan: 'Tempo',
            why: [],
            watchFor: [],
            checkAfter: 'หลังซ้อม',
            safetyNote: 'ระวัง'
          })
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
  });

  const response = await handler(request(), env);
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.match(body.error, /changed the Local Coach action/);
});

test('AI Coach Worker refuses raw health data', async () => {
  const handler = createAiCoachHandler();
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
