import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/apple-health-shortcut/src/index.js';
import {
  APPLE_HEALTH_SHORTCUT_REQUIRED_SECRETS,
  buildSetupReceipt,
  buildWorkerConfig
} from '../scripts/lib/apple-health-shortcut-setup.mjs';
import {
  getAppleHealthShortcutConfig,
  isAppleHealthShortcutConfigured,
  normalizeAppleHealthPayload,
  parseAppleHealthShortcutSetupReceipt
} from '../public/js/adapters/apple-health.js';

class MemoryKV {
  constructor() { this.values = new Map(); }
  async get(key) { return this.values.get(key) ?? null; }
  async put(key, value) { this.values.set(key, String(value)); }
  async delete(key) { this.values.delete(key); }
}

const token = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
const encryptionKey = Buffer.alloc(32, 7).toString('base64');
const env = () => ({
  APP_ORIGIN: 'https://app.example.workers.dev',
  APPLE_HEALTH_DATA: new MemoryKV(),
  APPLE_HEALTH_BRIDGE_TOKEN: token,
  APPLE_HEALTH_ENCRYPTION_KEY: encryptionKey
});

function request(path, { method = 'GET', body, auth = true } = {}) {
  return new Request(`https://apple.example.workers.dev${path}`, {
    method,
    headers: {
      origin: 'https://app.example.workers.dev',
      ...(auth ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
}

test('Apple Health Shortcut setup creates separate encrypted Worker configuration', () => {
  const config = buildWorkerConfig({
    appOrigin: 'https://app.example.workers.dev',
    workerName: 'trail-runner-coach-apple-health-sync'
  });
  assert.equal(config.name, 'trail-runner-coach-apple-health-sync');
  assert.equal(config.vars.APP_ORIGIN, 'https://app.example.workers.dev');
  for (const secret of APPLE_HEALTH_SHORTCUT_REQUIRED_SECRETS) assert.ok(config.secrets.required.includes(secret));
  const receipt = buildSetupReceipt({
    workerUrl: 'https://trail-runner-coach-apple-health-sync.demo.workers.dev',
    appOrigin: 'https://app.example.workers.dev',
    workerName: config.name,
    accessToken: token
  });
  assert.equal(receipt.containsSecrets, true);
  const parsed = parseAppleHealthShortcutSetupReceipt(receipt);
  assert.equal(parsed.baseUrl, receipt.workerUrl);
  assert.equal(parsed.accessToken, token);
  const settings = { integrations: { appleHealthShortcut: parsed } };
  assert.equal(isAppleHealthShortcutConfigured(settings), true);
  assert.equal(getAppleHealthShortcutConfig(settings).shortcutName, 'TRC Apple Health Sync');
});

test('Apple Health Shortcut Worker imports encrypted daily data and returns normalized sync payload', async () => {
  const bindings = env();
  const payload = {
    source: 'apple_health',
    exportedAt: '2026-06-26T06:30:00.000Z',
    dailyMetric: {
      date: '2026-06-26', sleepHours: 7.2, restingHr: 54, hrvMs: 48,
      steps: 8240, activeEnergyKcal: 780, exerciseMinutes: 65,
      walkingRunningDistanceKm: 9.4
    },
    bodyComposition: { date: '2026-06-26', weightKg: 88.9, percentBodyFat: 27.5 }
  };
  let response = await worker.fetch(request('/v1/import', { method: 'POST', body: payload }), bindings);
  assert.equal(response.status, 201);
  const stored = await bindings.APPLE_HEALTH_DATA.get('profile:default');
  assert.ok(stored);
  assert.equal(stored.includes('8240'), false);
  assert.equal(stored.includes('sleepHours'), false);

  response = await worker.fetch(request('/v1/sync?days=90'), bindings);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.source, 'apple_health');
  assert.equal(result.transport, 'shortcuts_bridge');
  assert.equal(result.dailyMetrics[0].steps, 8240);
  assert.equal(result.bodyComposition[0].weightKg, 88.9);

  const normalized = normalizeAppleHealthPayload(result, { athlete: { maxHr: 190 } });
  assert.equal(normalized.checkins[0].restingHr, 54);
  assert.equal(normalized.checkins[0].wearable.transport, 'shortcuts_bridge');
});

test('Apple Health Shortcut Worker rejects missing or wrong bearer token', async () => {
  const bindings = env();
  const response = await worker.fetch(request('/v1/sync', { auth: false }), bindings);
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.code, 'unauthorized');
});

test('Apple Health Worker accepts Health Auto Export JSON v2 metrics and preserves Shortcut compatibility', async () => {
  const bindings = env();
  const payload = {
    data: {
      metrics: [
        { name: 'step_count', units: 'count', data: [
          { qty: 5000, date: '2026-06-27 10:00:00 +0700' },
          { qty: 3240, date: '2026-06-27 18:00:00 +0700' }
        ] },
        { name: 'active_energy', units: 'kcal', data: [{ qty: 780, date: '2026-06-27 23:00:00 +0700' }] },
        { name: 'apple_exercise_time', units: 'min', data: [{ qty: 65, date: '2026-06-27 23:00:00 +0700' }] },
        { name: 'walking_running_distance', units: 'km', data: [{ qty: 9.4, date: '2026-06-27 23:00:00 +0700' }] },
        { name: 'resting_heart_rate', units: 'bpm', data: [{ qty: 54, date: '2026-06-27 07:00:00 +0700' }] },
        { name: 'heart_rate_variability_sdnn', units: 'ms', data: [{ qty: 48, date: '2026-06-27 07:10:00 +0700' }] },
        { name: 'sleep_analysis', units: 'hr', data: [{
          date: '2026-06-27', totalSleep: 7.2, asleep: 7.2,
          sleepStart: '2026-06-26 23:10:00 +0700', sleepEnd: '2026-06-27 06:22:00 +0700'
        }] },
        { name: 'weight_&_body_mass', units: 'kg', data: [{ qty: 88.9, date: '2026-06-27 06:30:00 +0700' }] },
        { name: 'body_fat_percentage', units: '%', data: [{ qty: 27.5, date: '2026-06-27 06:31:00 +0700' }] }
      ]
    }
  };

  let response = await worker.fetch(request('/v1/import', { method: 'POST', body: payload }), bindings);
  assert.equal(response.status, 201);
  const imported = await response.json();
  assert.equal(imported.transport, 'health_auto_export');
  assert.equal(imported.counts.dailyMetrics, 1);
  assert.equal(imported.counts.bodyComposition, 1);

  response = await worker.fetch(request('/v1/sync?days=7'), bindings);
  const result = await response.json();
  assert.equal(result.transport, 'health_auto_export');
  assert.equal(result.ingestionFormat, 'health_auto_export_json_v2');
  assert.equal(result.dailyMetrics[0].steps, 8240);
  assert.equal(result.dailyMetrics[0].sleepHours, 7.2);
  assert.equal(result.dailyMetrics[0].restingHr, 54);
  assert.equal(result.dailyMetrics[0].hrvMs, 48);
  assert.equal(result.dailyMetrics[0].activeEnergyKcal, 780);
  assert.equal(result.dailyMetrics[0].exerciseMinutes, 65);
  assert.equal(result.dailyMetrics[0].walkingRunningDistanceKm, 9.4);
  assert.equal(result.bodyComposition[0].weightKg, 88.9);
  assert.equal(result.bodyComposition[0].percentBodyFat, 27.5);
  assert.equal(result.activities.length, 0);
});

test('Health Auto Export Buddhist Era dates are normalized to Gregorian dates', async () => {
  const bindings = env();
  const payload = {
    data: {
      metrics: [
        { name: 'step_count', units: 'count', data: [{ qty: 7121, date: '2569-06-22 23:59:00 +0700' }] },
        { name: 'active_energy', units: 'kcal', data: [{ qty: 314.05, date: '2569-06-22 23:59:00 +0700' }] },
        { name: 'sleep_analysis', units: 'hr', data: [{ date: '2569-06-22', totalSleep: 6.35 }] }
      ]
    }
  };

  let response = await worker.fetch(request('/v1/import', { method: 'POST', body: payload }), bindings);
  assert.equal(response.status, 201);
  response = await worker.fetch(request('/v1/sync?days=365'), bindings);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.dailyMetrics.length, 1);
  assert.equal(result.dailyMetrics[0].date, '2026-06-22');
  assert.equal(result.dailyMetrics[0].steps, 7121);
  assert.equal(result.dailyMetrics[0].sleepHours, 6.35);
});

test('Frontend Apple Health adapter defensively normalizes Buddhist Era dates', () => {
  const normalized = normalizeAppleHealthPayload({
    source: 'apple_health',
    exportedAt: '2026-06-28T06:24:22.138Z',
    dailyMetrics: [{ date: '2569-06-27', steps: 2364 }],
    bodyComposition: [{ date: '2569-06-27', weightKg: 88.9 }],
    activities: []
  });
  assert.equal(normalized.checkins[0].date, '2026-06-27');
  assert.equal(normalized.bodyComposition[0].date, '2026-06-27');
});
