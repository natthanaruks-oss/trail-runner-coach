import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  hasGoogleHealthSource,
  selectGoogleHealthInsights,
} from '../public/js/core/health-insights.js';

test('Google Health source detection accepts direct and hybrid records', () => {
  assert.equal(
    hasGoogleHealthSource({ source: 'google_health' }),
    true,
  );
  assert.equal(
    hasGoogleHealthSource({
      source: 'hybrid',
      sources: ['manual', 'google_health'],
    }),
    true,
  );
  assert.equal(
    hasGoogleHealthSource({
      source: 'apple_health',
      sources: ['apple_health'],
    }),
    false,
  );
});

test('Today dashboard is wired to Google Health, not Apple Health', async () => {
  const dashboard = await readFile(
    new URL('../public/js/views/dashboard.js', import.meta.url),
    'utf8',
  );

  assert.match(dashboard, /selectGoogleHealthInsights/);
  assert.match(
    dashboard,
    /syncProviderNow\(app\.store, 'google_health'/,
  );
  assert.match(dashboard, /scheduleDashboardGoogleHealthSync/);
  assert.doesNotMatch(
    dashboard,
    /syncProviderNow\(app\.store, 'apple_health'/,
  );
  assert.doesNotMatch(dashboard, /autoPullAppleHealth/);
});

test('Google selector ignores Apple-only daily metrics', () => {
  const state = {
    checkins: [
      {
        date: '2026-07-13',
        source: 'apple_health',
        sources: ['apple_health'],
        sleepHours: 4,
        restingHr: 99,
        hrvMs: 5,
      },
      {
        date: '2026-07-14',
        source: 'google_health',
        sources: ['google_health'],
        sleepHours: 7.5,
        restingHr: 52,
        hrvMs: 61,
        steps: 4200,
        wearable: {
          sourceDevice: 'Fitbit',
          importedAt: '2026-07-14T06:00:00.000Z',
        },
      },
    ],
    metadata: [
      {
        id: 'provider_sync_state_v1',
        providers: {
          google_health: {
            connected: true,
            lastSuccessAt: '2026-07-14T06:00:00.000Z',
          },
        },
      },
    ],
    bodyComposition: [],
    activities: [],
    foodLogs: [],
    settings: {
      athlete: {},
      nutrition: {},
    },
  };

  const result = selectGoogleHealthInsights(
    state,
    '2026-07-14',
    7,
  );

  assert.equal(result.provider, 'google_health');
  assert.equal(result.metrics.sleepHours, 7.5);
  assert.equal(result.metrics.restingHr, 52);
  assert.equal(result.metrics.hrvMs, 61);
  assert.equal(result.checkin.source, 'google_health');
});
