import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/wearable-sync/src/index.js';
import {
  STRAVA_REQUIRED_SECRETS,
  buildSetupReceipt,
  buildWorkerConfig,
  parseWranglerWorkerUrl,
  setupUrls
} from '../scripts/lib/strava-setup.mjs';
import { getStravaSetupDetails, parseStravaSetupReceipt } from '../public/js/adapters/provider-sync.js';

test('Strava setup helper builds a safe Worker config and receipt', () => {
  const config = buildWorkerConfig({
    appOrigin: 'https://trail-runner-coaches.example.workers.dev',
    workerName: 'trail-runner-coach-wearable-sync'
  });
  assert.equal(config.vars.APP_ORIGIN, 'https://trail-runner-coaches.example.workers.dev');
  assert.deepEqual(config.secrets.required, [...STRAVA_REQUIRED_SECRETS]);
  assert.deepEqual(config.kv_namespaces, []);

  const preserved = buildWorkerConfig({
    appOrigin: 'https://trail-runner-coaches.example.workers.dev',
    workerName: 'trail-runner-coach-wearable-sync',
    existingConfig: {
      vars: { GARMIN_SCOPES: 'health activity' },
      secrets: { required: ['GARMIN_CLIENT_SECRET'] },
      kv_namespaces: [{ binding: 'OAUTH_STATE', id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }]
    }
  });
  assert.equal(preserved.vars.GARMIN_SCOPES, 'health activity');
  assert.ok(preserved.secrets.required.includes('GARMIN_CLIENT_SECRET'));
  assert.equal(preserved.kv_namespaces[0].binding, 'OAUTH_STATE');

  const urls = setupUrls('https://trail-runner-coach-wearable-sync.example.workers.dev/');
  assert.equal(urls.callbackDomain, 'trail-runner-coach-wearable-sync.example.workers.dev');
  assert.equal(urls.callbackUrl, 'https://trail-runner-coach-wearable-sync.example.workers.dev/oauth/strava/callback');

  const receipt = buildSetupReceipt({
    workerUrl: urls.workerUrl,
    appOrigin: config.vars.APP_ORIGIN,
    workerName: config.name
  });
  assert.equal(receipt.containsSecrets, false);
  assert.equal(JSON.stringify(receipt).includes('CLIENT_SECRET'), false);
  assert.equal(parseStravaSetupReceipt(receipt).workerUrl, urls.workerUrl);
  assert.deepEqual(getStravaSetupDetails(urls.workerUrl), {
    workerUrl: urls.workerUrl,
    callbackDomain: urls.callbackDomain,
    callbackUrl: urls.callbackUrl,
    webhookUrl: urls.webhookUrl
  });
});

test('Wrangler output parser finds the deployed workers.dev URL', () => {
  assert.equal(
    parseWranglerWorkerUrl('Uploaded\nhttps://trail-runner-coach-wearable-sync.demo.workers.dev\nCurrent Version ID'),
    'https://trail-runner-coach-wearable-sync.demo.workers.dev'
  );
});

test('Worker setup status reports readiness without exposing secret values', async () => {
  const env = {
    APP_ORIGIN: 'https://trail-runner-coaches.demo.workers.dev',
    OAUTH_STATE: {},
    WEARABLE_TOKENS: {},
    WEARABLE_EVENTS: {},
    TOKEN_ENCRYPTION_KEY: 'sensitive-token-key',
    STRAVA_CLIENT_ID: '12345',
    STRAVA_CLIENT_SECRET: 'sensitive-client-secret',
    STRAVA_VERIFY_TOKEN: 'sensitive-verify-token'
  };
  const response = await worker.fetch(new Request('https://sync.demo.workers.dev/setup/status'), env);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ready, true);
  assert.equal(payload.providers.strava.ready, true);
  assert.equal(payload.callbackUrl, 'https://sync.demo.workers.dev/oauth/strava/callback');
  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes('sensitive-client-secret'), false);
  assert.equal(serialized.includes('sensitive-token-key'), false);
});
