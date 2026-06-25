import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifySyncError,
  getSyncState,
  isProviderSyncDue,
  nextRetryDelayMs,
  syncProviderNow,
  MAX_RETRY_ATTEMPTS
} from '../public/js/adapters/sync-manager.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key)
  };
}

function fakeStore() {
  const state = {
    settings: { integrations: { syncBaseUrl: 'https://sync.example.workers.dev' } },
    metadata: [],
    activities: []
  };
  return {
    getState: () => state,
    async upsertRecord(_store, record) {
      const index = state.metadata.findIndex(item => item.id === record.id);
      if (index >= 0) state.metadata[index] = structuredClone(record);
      else state.metadata.push(structuredClone(record));
      return record;
    }
  };
}

test('retry delays back off and respect Retry-After', () => {
  assert.equal(nextRetryDelayMs(1), 60_000);
  assert.equal(nextRetryDelayMs(3), 15 * 60_000);
  assert.equal(nextRetryDelayMs(99), 6 * 60 * 60_000);
  assert.equal(nextRetryDelayMs(1, 120_000), 120_000);
});

test('sync error classification separates retryable and authorization failures', () => {
  const rate = Object.assign(new Error('rate limit'), { status: 429, code: 'rate_limited' });
  assert.equal(classifySyncError(rate).retryable, true);
  const auth = Object.assign(new Error('expired'), { status: 401 });
  assert.equal(classifySyncError(auth).status, 'auth_error');
  const pending = Object.assign(new Error('pending'), { status: 501, code: 'provider_adapter_pending' });
  assert.equal(classifySyncError(pending).status, 'pending');
});

test('provider sync persists last success and clears retry metadata', async () => {
  const originalFetch = globalThis.fetch;
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = memoryStorage();
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, provider: 'strava', activities: [] }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
  try {
    const store = fakeStore();
    const result = await syncProviderNow(store, 'strava', { trigger: 'test', days: 14 });
    assert.equal(result.ok, true);
    const sync = getSyncState(store.getState());
    assert.equal(sync.providers.strava.status, 'success');
    assert.ok(sync.providers.strava.lastSuccessAt);
    assert.equal(sync.queue.length, 0);
    assert.equal(isProviderSyncDue(sync.providers.strava, 30, Date.now()), false);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.localStorage = originalStorage;
  }
});

test('retryable provider failure is queued with persistent attempt count', async () => {
  const originalFetch = globalThis.fetch;
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = memoryStorage();
  globalThis.fetch = async () => { throw new TypeError('network down'); };
  try {
    const store = fakeStore();
    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt += 1) {
      const result = await syncProviderNow(store, 'strava', { trigger: 'test', throwOnError: false });
      assert.equal(result.ok, false);
    }
    const sync = getSyncState(store.getState());
    assert.equal(sync.providers.strava.status, 'failed');
    assert.equal(sync.providers.strava.retryCount, MAX_RETRY_ATTEMPTS);
    assert.equal(sync.queue[0].status, 'failed');
    assert.equal(sync.queue[0].nextRetryAt, null);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.localStorage = originalStorage;
  }
});
