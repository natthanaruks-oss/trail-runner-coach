import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldAutoPullAppleHealth } from '../public/js/core/apple-health-auto-pull.js';

function state(overrides = {}) {
  return {
    settings: {
      integrations: {
        appleHealthShortcut: {
          baseUrl: 'https://example.workers.dev',
          accessToken: 'x'.repeat(40),
          shortcutName: 'TRC Apple Health Sync'
        }
      }
    },
    metadata: [],
    ...overrides
  };
}

test('auto-pull runs when the bridge is configured but the browser has no Apple Health data', () => {
  assert.equal(shouldAutoPullAppleHealth(state(), { hasData: false }, Date.parse('2026-06-27T12:00:00Z')), true);
});

test('auto-pull waits when recent Apple Health data already exists', () => {
  const now = Date.parse('2026-06-27T12:00:00Z');
  const current = state({
    metadata: [{
      id: 'provider_sync_state_v1',
      providers: { apple_health: { lastSuccessAt: '2026-06-27T11:55:00Z' } }
    }]
  });
  assert.equal(shouldAutoPullAppleHealth(current, { hasData: true, lastImportedAt: '2026-06-27T11:55:00Z' }, now), false);
});
