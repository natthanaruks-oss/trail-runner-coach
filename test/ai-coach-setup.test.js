import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSetupReceipt,
  buildWorkerConfig,
  parseWranglerWorkerUrl
} from '../scripts/lib/ai-coach-setup.mjs';

test('AI Coach Worker config declares secrets without storing secret values', () => {
  const config = buildWorkerConfig({
    appOrigin: 'https://app.example',
    workerName: 'trail-runner-coach-ai',
    model: 'gpt-5.4-mini'
  });

  assert.deepEqual(config.secrets.required, [
    'OPENAI_API_KEY',
    'AI_COACH_ACCESS_TOKEN'
  ]);
  assert.equal(config.vars.APP_ORIGIN, 'https://app.example');
  assert.equal(config.vars.OPENAI_MODEL, 'gpt-5.4-mini');
  assert.doesNotMatch(JSON.stringify(config), /sk-/);
});

test('AI Coach receipt contains only Worker credential and no OpenAI key', () => {
  const receipt = buildSetupReceipt({
    workerUrl: 'https://trail-runner-coach-ai.example.workers.dev',
    workerName: 'trail-runner-coach-ai',
    model: 'gpt-5.4-mini',
    accessToken: 'a'.repeat(48)
  });

  assert.equal(receipt.kind, 'trail-runner-coach-ai-coach-v1');
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
