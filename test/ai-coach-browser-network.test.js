import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyAiCoachFetchFailure,
  diagnoseAiCoachConnection
} from '../public/js/adapters/ai-coach.js';
import {
  createAiCoachHandler
} from '../workers/ai-coach/src/index.js';

test('Safari Load failed is converted into a useful diagnosis when health is reachable', () => {
  const message = classifyAiCoachFetchFailure({
    error: new TypeError('Load failed'),
    diagnosis: {
      reachable: true,
      configured: true
    },
    elapsedMs: 1200,
    timeoutMs: 75000,
    locationOrigin: 'https://app.example'
  });

  assert.match(message, /AI Worker ติดต่อได้/);
  assert.match(message, /https:\/\/app\.example/);
  assert.doesNotMatch(message, /^Load failed$/);
});

test('Safari-style abort near the request deadline is classified as timeout', () => {
  const message = classifyAiCoachFetchFailure({
    error: new TypeError('Load failed'),
    diagnosis: {
      reachable: true,
      configured: true
    },
    elapsedMs: 74950,
    timeoutMs: 75000,
    locationOrigin: 'https://app.example'
  });

  assert.match(message, /ใช้เวลาประมวลผลนานเกินไป/);
});

test('health diagnosis reports a configured Workers AI service', async () => {
  const result = await diagnoseAiCoachConnection({
    baseUrl: 'https://coach.example',
    fetchImpl: async url => {
      assert.match(String(url), /\/health\?ts=/);
      return new Response(
        JSON.stringify({
          ok: true,
          configured: true,
          provider: 'cloudflare-workers-ai',
          model: '@cf/qwen/qwen3-30b-a3b-fp8'
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
    }
  });

  assert.equal(result.reachable, true);
  assert.equal(result.configured, true);
  assert.equal(result.provider, 'cloudflare-workers-ai');
});

test('Worker preflight reflects an alternate browser origin', async () => {
  const handler = createAiCoachHandler();

  const response = await handler(
    new Request(
      'https://worker.example/v1/explain',
      {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://alternate-app.example',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers':
            'authorization,content-type'
        }
      }
    ),
    {}
  );

  assert.equal(response.status, 204);
  assert.equal(
    response.headers.get('access-control-allow-origin'),
    'https://alternate-app.example'
  );
});

test('Bearer token still protects POST requests from alternate origins', async () => {
  const env = {
    AI_COACH_ACCESS_TOKEN: 'a'.repeat(48),
    WORKERS_AI_MODEL: '@cf/qwen/qwen3-30b-a3b-fp8',
    AI: {
      run: async () => ({
        response: {
          actionCodeEcho: 'follow_plan',
          statusEcho: 'green',
          safetyLockEcho: false,
          headline: 'ทำตามแผนได้',
          summary: 'สัญญาณสนับสนุนแผน Easy วันนี้',
          todayPlan: 'Easy 5 km และ Vertical 80 m',
          why: [],
          watchFor: [],
          checkAfter: 'ประเมินหลัง 10 นาที',
          safetyNote: 'หยุดเมื่อมีอาการผิดปกติ'
        }
      })
    }
  };

  const snapshot = {
    version: 'ai_coach_snapshot_v1',
    date: '2026-06-28',
    language: 'th',
    digest: 'ac1-browser-test',
    decision: {
      actionCode: 'follow_plan',
      status: 'green',
      hardStop: false,
      safeToEscalate: false,
      suggestedType: 'Easy',
      suggestedDistanceKm: 5,
      suggestedVerticalM: 80,
      intensityCode: 'planned',
      confidence: 83,
      reasons: [],
      missing: []
    },
    privacy: {
      rawHealthRowsExcluded: true,
      directIdentityExcluded: true,
      secretsExcluded: true
    }
  };

  const handler = createAiCoachHandler();

  const unauthorized = await handler(
    new Request(
      'https://worker.example/v1/explain',
      {
        method: 'POST',
        headers: {
          Origin: 'https://alternate-app.example',
          Authorization: 'Bearer wrong-token',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ snapshot })
      }
    ),
    env
  );

  assert.equal(unauthorized.status, 401);

  const authorized = await handler(
    new Request(
      'https://worker.example/v1/explain',
      {
        method: 'POST',
        headers: {
          Origin: 'https://alternate-app.example',
          Authorization:
            `Bearer ${env.AI_COACH_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ snapshot })
      }
    ),
    env
  );

  assert.equal(authorized.status, 200);
  assert.equal(
    authorized.headers.get(
      'access-control-allow-origin'
    ),
    'https://alternate-app.example'
  );
});
