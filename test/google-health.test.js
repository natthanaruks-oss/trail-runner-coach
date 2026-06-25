import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { normalizeGoogleHealthApiData } from '../workers/wearable-sync/src/index.js';
import {
  GOOGLE_HEALTH_REQUIRED_SECRETS,
  buildGoogleHealthSetupReceipt,
  buildGoogleHealthWorkerConfig,
  googleHealthSetupUrls,
  normalizeGoogleClientId
} from '../scripts/lib/google-health-setup.mjs';
import {
  getGoogleHealthSetupDetails,
  parseGoogleHealthSetupReceipt,
  PROVIDER_DEFINITIONS
} from '../public/js/adapters/provider-sync.js';
import { normalizeGoogleHealthPayload } from '../public/js/adapters/google-health.js';
import { prepareActivityImport } from '../public/js/core/activity-dedup.js';

const CLIENT_ID = '1234567890-demo.apps.googleusercontent.com';

test('Google Health setup creates a safe shared Worker config and receipt', () => {
  assert.equal(normalizeGoogleClientId(CLIENT_ID), CLIENT_ID);
  const config = buildGoogleHealthWorkerConfig({
    appOrigin: 'https://trail-runner-coaches.demo.workers.dev',
    workerName: 'trail-runner-coach-wearable-sync',
    existingConfig: {
      vars: { STRAVA_SCOPES: 'read,activity:read_all' },
      secrets: { required: ['STRAVA_CLIENT_ID'] },
      kv_namespaces: [{ binding: 'OAUTH_STATE', id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }]
    }
  });
  assert.equal(config.vars.STRAVA_SCOPES, 'read,activity:read_all');
  assert.match(config.vars.GOOGLE_HEALTH_SCOPES, /googlehealth\.sleep\.readonly/);
  for (const secret of GOOGLE_HEALTH_REQUIRED_SECRETS) assert.ok(config.secrets.required.includes(secret));
  const urls = googleHealthSetupUrls('https://sync.demo.workers.dev');
  assert.equal(urls.callbackUrl, 'https://sync.demo.workers.dev/oauth/google_health/callback');
  const receipt = buildGoogleHealthSetupReceipt({ workerUrl: urls.workerUrl, appOrigin: config.vars.APP_ORIGIN, workerName: config.name });
  assert.equal(receipt.containsSecrets, false);
  assert.equal(parseGoogleHealthSetupReceipt(receipt).callbackUrl, urls.callbackUrl);
  assert.deepEqual(getGoogleHealthSetupDetails(urls.workerUrl), {
    workerUrl: urls.workerUrl,
    callbackUrl: urls.callbackUrl
  });
  assert.ok(PROVIDER_DEFINITIONS.google_health);
});

test('Google Health API records normalize official v4 shapes into activities, daily recovery and body composition', () => {
  const civil = (year, month, day, hours = 0, minutes = 0, seconds = 0) => ({
    date: { year, month, day },
    time: { hours, minutes, seconds }
  });
  const raw = {
    exercise: [{
      name: 'users/me/dataTypes/exercise/dataPoints/run-1',
      dataSource: { device: { displayName: 'Fitbit Charge Demo' }, platform: 'FITBIT' },
      exercise: {
        interval: {
          startTime: '2026-06-24T11:00:00Z',
          endTime: '2026-06-24T12:30:00Z',
          civilStartTime: civil(2026, 6, 24, 18, 0),
          civilEndTime: civil(2026, 6, 24, 19, 30)
        },
        exerciseType: 'TRAIL_RUNNING',
        displayName: 'Evening trail',
        activeDuration: { seconds: '5100' },
        metricsSummary: {
          distanceMillimeters: '12500000',
          caloriesKcal: 820,
          averageHeartRateBeatsPerMinute: 148,
          maximumHeartRateBeatsPerMinute: 171,
          elevationGainMillimeters: '620000'
        }
      }
    }],
    sleep: [{
      dataSource: { application: { displayName: 'Fitbit' } },
      sleep: {
        interval: {
          startTime: '2026-06-23T16:00:00Z',
          endTime: '2026-06-23T23:30:00Z',
          civilStartTime: civil(2026, 6, 23, 23, 0),
          civilEndTime: civil(2026, 6, 24, 6, 30)
        },
        summary: { minutesAsleep: 420 },
        metadata: { nap: false }
      }
    }],
    dailyRestingHeartRate: [{
      dailyRestingHeartRate: { date: { year: 2026, month: 6, day: 24 }, beatsPerMinute: '57' }
    }],
    dailyHeartRateVariability: [{
      dailyHeartRateVariability: {
        date: { year: 2026, month: 6, day: 24 },
        averageHeartRateVariabilityMilliseconds: 48,
        deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds: 52
      }
    }],
    steps: [{ steps: { interval: { civilStartTime: civil(2026, 6, 24) }, count: '13200' } }],
    activeEnergyBurned: [{ activeEnergyBurned: { interval: { civilStartTime: civil(2026, 6, 24) }, kcal: 1180 } }],
    activeMinutes: [{
      activeMinutes: {
        interval: { civilStartTime: civil(2026, 6, 24) },
        activeMinutesByActivityLevel: [
          { activityLevel: 'MODERATE', activeMinutes: 45 },
          { activityLevel: 'VIGOROUS', activeMinutes: 60 }
        ]
      }
    }],
    distance: [{ distance: { interval: { civilStartTime: civil(2026, 6, 24) }, millimeters: '14800000' } }],
    weight: [{
      weight: {
        sampleTime: {
          physicalTime: '2026-06-24T00:00:00Z',
          civilTime: civil(2026, 6, 24, 7, 0)
        },
        weightGrams: '88900'
      }
    }],
    bodyFat: [{
      bodyFat: {
        sampleTime: {
          physicalTime: '2026-06-24T00:00:00Z',
          civilTime: civil(2026, 6, 24, 7, 0)
        },
        percentage: 27.5
      }
    }]
  };
  const normalized = normalizeGoogleHealthApiData(raw, { days: 30 });
  assert.equal(normalized.source, 'google_health');
  assert.equal(normalized.activities.length, 1);
  assert.equal(normalized.activities[0].date, '2026-06-24');
  assert.equal(normalized.activities[0].name, 'Evening trail');
  assert.equal(normalized.activities[0].distanceKm, 12.5);
  assert.equal(normalized.activities[0].elevationGainM, 620);
  assert.equal(normalized.activities[0].avgHr, 148);
  assert.equal(normalized.activities[0].maxHr, 171);
  assert.equal(normalized.activities[0].terrain, 'trail');
  assert.equal(normalized.activities[0].isNight, true);
  assert.equal(normalized.activities[0].sourceDevice, 'Fitbit Charge Demo');
  const daily = normalized.dailyMetrics.find(item => item.date === '2026-06-24');
  assert.equal(daily.sleepHours, 7);
  assert.equal(daily.restingHr, 57);
  assert.equal(daily.hrvMs, 48);
  assert.equal(daily.steps, 13200);
  assert.equal(daily.activeEnergyKcal, 1180);
  assert.equal(daily.exerciseMinutes, 105);
  assert.equal(daily.walkingRunningDistanceKm, 14.8);
  assert.equal(normalized.bodyComposition[0].date, '2026-06-24');
  assert.equal(normalized.bodyComposition[0].weightKg, 88.9);
  assert.equal(normalized.bodyComposition[0].percentBodyFat, 27.5);

  const appPayload = normalizeGoogleHealthPayload(normalized, { athlete: { maxHr: 190 } });
  assert.equal(appPayload.checkins[0].source, 'google_health');
  assert.equal(appPayload.activities[0].maxHrReference, 190);
});

test('Google Health and Strava versions of one activity deduplicate into one canonical workout', () => {
  const start = '2026-06-24T11:00:00.000Z';
  const existing = [{ id: 'gh-1', externalId: 'google-health:run-1', source: 'google_health', date: '2026-06-24', startTime: start, type: 'TrailRun', durationMin: 90, distanceKm: 12.5, elevationGainM: 620, avgHr: 148 }];
  const incoming = [{ id: 'strava-1', externalId: 'strava:999', source: 'strava', date: '2026-06-24', startTime: '2026-06-24T11:02:00.000Z', type: 'TrailRun', durationMin: 89, distanceKm: 12.45, elevationGainM: 615, avgHr: 149 }];
  const result = prepareActivityImport(existing, incoming);
  assert.equal(result.records.length, 1);
  assert.equal(result.summary.merged, 1);
  assert.ok(result.records[0].sources.includes('google_health'));
  assert.ok(result.records[0].sources.includes('strava'));
});

test('Wearable Worker reports Google Health readiness without exposing credentials', async () => {
  const env = {
    APP_ORIGIN: 'https://trail-runner-coaches.demo.workers.dev',
    OAUTH_STATE: {}, WEARABLE_TOKENS: {}, WEARABLE_EVENTS: {},
    TOKEN_ENCRYPTION_KEY: 'hidden-encryption-key',
    GOOGLE_HEALTH_CLIENT_ID: CLIENT_ID,
    GOOGLE_HEALTH_CLIENT_SECRET: 'hidden-google-secret'
  };
  const response = await worker.fetch(new Request('https://sync.demo.workers.dev/setup/status'), env);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.providers.google_health.ready, true);
  assert.equal(payload.googleHealthCallbackUrl, 'https://sync.demo.workers.dev/oauth/google_health/callback');
  assert.equal(JSON.stringify(payload).includes('hidden-google-secret'), false);
});
