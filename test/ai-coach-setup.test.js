import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSetupReceipt,
  buildWorkerConfig,
  DEFAULT_WORKERS_AI_MODEL,
  normalizeModel,
  parseWranglerWorkerUrl
} from '../scripts/lib/ai-coach-setup.mjs';

test('Worker config uses a Cloudflare AI binding and no provider API key', () => {
  const config = buildWorkerConfig({
    appOrigin: 'https://app.example',
    workerName: 'trail-runner-coach-ai'
  });

  assert.deepEqual(config.ai, { binding: 'AI' });
  assert.equal(
    config.vars.WORKERS_AI_MODEL,
    '@cf/qwen/qwen3-30b-a3b-fp8'
  );
  assert.equal(
    JSON.stringify(config).includes('OPENAI_API_KEY'),
    false
  );
});

test('default Workers AI model is normalized safely', () => {
  assert.equal(
    normalizeModel(DEFAULT_WORKERS_AI_MODEL),
    DEFAULT_WORKERS_AI_MODEL
  );
  assert.throws(
    () => normalizeModel('gpt-5.4-mini'),
    /Workers AI model ID/
  );
});

test('setup receipt identifies Cloudflare Workers AI and contains no provider key', () => {
  const receipt = buildSetupReceipt({
    workerUrl:
      'https://trail-runner-coach-ai.example.workers.dev',
    workerName: 'trail-runner-coach-ai',
    model: DEFAULT_WORKERS_AI_MODEL,
    accessToken: 'a'.repeat(48)
  });

  assert.equal(
    receipt.provider,
    'cloudflare-workers-ai'
  );
  assert.equal(receipt.accessToken.length, 48);
  assert.equal('openAiKey' in receipt, false);
});

test('Wrangler output parser finds the deployed Worker URL', () => {
  assert.equal(
    parseWranglerWorkerUrl(
      'Deployed\nhttps://trail-runner-coach-ai.example.workers.dev'
    ),
    'https://trail-runner-coach-ai.example.workers.dev'
  );
});
