import { STORES } from '../core/constants.js';
import { nowIso } from '../core/date.js';
import { importActivitiesWithDedup } from './activity-import.js';
import {
  fetchProviderConnections,
  getSyncBaseUrl,
  syncProviderActivities
} from './provider-sync.js';
import {
  importAppleHealthPayload,
  isAppleHealthAvailable,
  requestAppleHealthPayload
} from './apple-health.js';
import { importGoogleHealthPayload } from './google-health.js';

export const SYNC_META_ID = 'provider_sync_state_v1';
export const SYNC_SCHEMA_VERSION = 1;
export const SYNC_PROVIDERS = Object.freeze(['apple_health', 'google_health', 'garmin', 'suunto', 'strava']);
export const CLOUD_SYNC_PROVIDERS = Object.freeze(['google_health', 'garmin', 'suunto', 'strava']);
export const DEFAULT_AUTO_SYNC_INTERVAL_MIN = 30;
export const MAX_RETRY_ATTEMPTS = 5;
export const RETRY_DELAYS_MS = Object.freeze([
  60_000,
  5 * 60_000,
  15 * 60_000,
  60 * 60_000,
  6 * 60 * 60_000
]);

const activeSyncs = new Map();
let lifecycleInstalled = false;
let retryTimer = null;
let lifecycleStore = null;

function emptyProvider(provider) {
  return {
    provider,
    connected: provider === 'apple_health' ? false : null,
    status: 'idle',
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
    lastResult: null,
    retryCount: 0,
    nextRetryAt: null,
    updatedAt: null
  };
}

export function createEmptySyncState() {
  return {
    id: SYNC_META_ID,
    schemaVersion: SYNC_SCHEMA_VERSION,
    autoSync: {
      enabled: true,
      intervalMin: DEFAULT_AUTO_SYNC_INTERVAL_MIN,
      lastRunAt: null,
      lastReason: null
    },
    providers: Object.fromEntries(SYNC_PROVIDERS.map(provider => [provider, emptyProvider(provider)])),
    queue: [],
    updatedAt: nowIso()
  };
}

export function normalizeSyncState(value) {
  const base = createEmptySyncState();
  const input = value && typeof value === 'object' ? value : {};
  const providers = {};
  for (const provider of SYNC_PROVIDERS) {
    providers[provider] = {
      ...base.providers[provider],
      ...(input.providers?.[provider] || {}),
      provider
    };
  }
  return {
    ...base,
    ...input,
    id: SYNC_META_ID,
    schemaVersion: SYNC_SCHEMA_VERSION,
    autoSync: {
      ...base.autoSync,
      ...(input.autoSync || {})
    },
    providers,
    queue: Array.isArray(input.queue)
      ? input.queue.filter(item => item && SYNC_PROVIDERS.includes(item.provider)).map(item => ({ ...item }))
      : [],
    updatedAt: input.updatedAt || base.updatedAt
  };
}

export function getSyncState(appState) {
  const record = appState?.metadata?.find(item => item.id === SYNC_META_ID);
  return normalizeSyncState(record);
}

async function persistSyncState(appStore, syncState, { emitEvent = true } = {}) {
  const normalized = normalizeSyncState({ ...syncState, updatedAt: nowIso() });
  await appStore.upsertRecord(STORES.META, normalized);
  if (emitEvent && globalThis.window?.dispatchEvent) {
    globalThis.window.dispatchEvent(new CustomEvent('trail-runner-coach:sync-state', { detail: normalized }));
  }
  return normalized;
}

function parseIsoMs(value) {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : 0;
}

export function isProviderSyncDue(providerState, intervalMin = DEFAULT_AUTO_SYNC_INTERVAL_MIN, now = Date.now()) {
  if (!providerState?.lastSuccessAt) return true;
  const intervalMs = Math.max(5, Number(intervalMin) || DEFAULT_AUTO_SYNC_INTERVAL_MIN) * 60_000;
  return now - parseIsoMs(providerState.lastSuccessAt) >= intervalMs;
}

export function nextRetryDelayMs(attempt, retryAfterMs = null) {
  if (Number.isFinite(Number(retryAfterMs)) && Number(retryAfterMs) > 0) {
    return Math.min(24 * 60 * 60_000, Math.max(30_000, Number(retryAfterMs)));
  }
  const index = Math.max(0, Math.min(RETRY_DELAYS_MS.length - 1, Number(attempt || 1) - 1));
  return RETRY_DELAYS_MS[index];
}

export function classifySyncError(error) {
  const status = Number(error?.status || 0);
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || 'Sync failed');
  const offline = globalThis.navigator && globalThis.navigator.onLine === false;

  if (offline || code === 'offline') return { retryable: true, status: 'queued', code: 'offline', message };
  if (code === 'not_connected' || status === 409) return { retryable: false, status: 'not_connected', code: code || 'not_connected', message };
  if (code === 'provider_adapter_pending' || status === 501) return { retryable: false, status: 'pending', code: code || 'provider_adapter_pending', message };
  if (status === 401 || status === 403 || code === 'invalid_token' || code === 'authorization_required') {
    return { retryable: false, status: 'auth_error', code: code || 'authorization_required', message };
  }
  if (status === 429 || status >= 500 || code === 'timeout' || code === 'network_error' || error instanceof TypeError) {
    return { retryable: true, status: 'queued', code: code || (status === 429 ? 'rate_limited' : 'network_error'), message };
  }
  return { retryable: false, status: 'error', code: code || 'sync_error', message };
}

function sanitizeResult(result = {}) {
  return {
    fetched: Number(result.fetched || 0),
    added: Number(result.added || 0),
    updated: Number(result.updated || 0),
    merged: Number(result.merged || 0),
    review: Number(result.review || 0),
    checkins: Number(result.checkins || 0),
    bodyComposition: Number(result.bodyComposition || 0)
  };
}

async function executeProviderSync(appStore, provider, days) {
  if (provider === 'apple_health') {
    const payload = await requestAppleHealthPayload(appStore.getState().settings, { days });
    const imported = await importAppleHealthPayload(appStore, payload);
    return sanitizeResult({
      fetched: Number(imported.activities || 0),
      ...(imported.activityImport || {}),
      checkins: imported.checkins,
      bodyComposition: imported.bodyComposition
    });
  }

  const payload = await syncProviderActivities(provider, appStore.getState().settings, days);
  if (provider === 'google_health') {
    const imported = await importGoogleHealthPayload(appStore, payload);
    return sanitizeResult({
      fetched: Number(imported.activities || 0),
      ...(imported.activityImport || {}),
      checkins: imported.checkins,
      bodyComposition: imported.bodyComposition,
      warnings: imported.warnings
    });
  }
  const activities = Array.isArray(payload.activities) ? payload.activities : [];
  const imported = activities.length
    ? await importActivitiesWithDedup(
      appStore,
      activities.map(item => ({ ...item, importedAt: item.importedAt || nowIso() })),
      { provider }
    )
    : { added: 0, updated: 0, merged: 0, review: 0 };
  return sanitizeResult({ fetched: activities.length, ...imported });
}

function queueForProvider(syncState, provider) {
  return syncState.queue.find(item => item.provider === provider && item.status !== 'dismissed');
}

function removeProviderQueue(syncState, provider) {
  syncState.queue = syncState.queue.filter(item => item.provider !== provider);
}

function enqueueRetry(syncState, provider, error, trigger, days) {
  const existing = queueForProvider(syncState, provider);
  const attempts = Math.min(MAX_RETRY_ATTEMPTS, Number(existing?.attempts || 0) + 1);
  const retryAfterMs = Number(error?.retryAfterMs || 0) || null;
  const exhausted = attempts >= MAX_RETRY_ATTEMPTS;
  const nextRetryAt = exhausted ? null : new Date(Date.now() + nextRetryDelayMs(attempts, retryAfterMs)).toISOString();
  const item = {
    id: existing?.id || `sync-retry-${provider}`,
    provider,
    status: exhausted ? 'failed' : 'queued',
    trigger,
    days,
    attempts,
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
    nextRetryAt,
    lastError: error?.message || 'Sync failed',
    errorCode: error?.code || null
  };
  syncState.queue = [...syncState.queue.filter(row => row.provider !== provider), item];
  return item;
}

function providerResultText(result) {
  const parts = [];
  if (result.checkins) parts.push(`${result.checkins} daily`);
  if (result.fetched) parts.push(`${result.fetched} fetched`);
  if (result.added) parts.push(`${result.added} added`);
  if (result.updated) parts.push(`${result.updated} updated`);
  if (result.merged) parts.push(`${result.merged} merged`);
  if (result.review) parts.push(`${result.review} review`);
  return parts.join(' · ') || 'No new data';
}

export async function syncProviderNow(appStore, provider, {
  days = null,
  trigger = 'manual',
  throwOnError = true,
  resetRetry = false
} = {}) {
  if (!SYNC_PROVIDERS.includes(provider)) throw new Error(`Unsupported sync provider: ${provider}`);
  if (activeSyncs.has(provider)) return activeSyncs.get(provider);

  const task = (async () => {
    let syncState = getSyncState(appStore.getState());
    const previous = syncState.providers[provider];
    const requestedDays = Math.max(1, Math.min(365, Number(days) || (previous.lastSuccessAt ? 14 : 90)));
    if (resetRetry) removeProviderQueue(syncState, provider);
    syncState.providers[provider] = {
      ...previous,
      connected: provider === 'apple_health' ? isAppleHealthAvailable(appStore.getState().settings) : previous.connected,
      status: 'syncing',
      lastAttemptAt: nowIso(),
      lastError: null,
      updatedAt: nowIso()
    };
    syncState = await persistSyncState(appStore, syncState);

    try {
      const result = await executeProviderSync(appStore, provider, requestedDays);
      syncState = getSyncState(appStore.getState());
      removeProviderQueue(syncState, provider);
      syncState.providers[provider] = {
        ...syncState.providers[provider],
        connected: true,
        status: 'success',
        lastSuccessAt: nowIso(),
        lastFailureAt: syncState.providers[provider]?.lastFailureAt || null,
        lastError: null,
        lastResult: result,
        retryCount: 0,
        nextRetryAt: null,
        updatedAt: nowIso()
      };
      await persistSyncState(appStore, syncState);
      return { ok: true, provider, result, message: providerResultText(result) };
    } catch (error) {
      const classification = classifySyncError(error);
      syncState = getSyncState(appStore.getState());
      let retry = null;
      if (classification.retryable) retry = enqueueRetry(syncState, provider, error, trigger, requestedDays);
      else removeProviderQueue(syncState, provider);
      syncState.providers[provider] = {
        ...syncState.providers[provider],
        connected: classification.status === 'not_connected' ? false : syncState.providers[provider]?.connected,
        status: retry?.status || classification.status,
        lastFailureAt: nowIso(),
        lastError: classification.message,
        retryCount: retry?.attempts || 0,
        nextRetryAt: retry?.nextRetryAt || null,
        updatedAt: nowIso()
      };
      await persistSyncState(appStore, syncState);
      error.classification = classification;
      if (throwOnError) throw error;
      return { ok: false, provider, error, classification, retry };
    }
  })().finally(() => activeSyncs.delete(provider));

  activeSyncs.set(provider, task);
  return task;
}

export async function updateConnectionSnapshot(appStore, connectionPayload = null) {
  let syncState = getSyncState(appStore.getState());
  const baseUrl = getSyncBaseUrl(appStore.getState().settings);
  let payload = connectionPayload;
  if (!payload && baseUrl) payload = await fetchProviderConnections(appStore.getState().settings);
  for (const provider of CLOUD_SYNC_PROVIDERS) {
    const connected = Boolean(payload?.providers?.[provider]?.connected);
    const current = syncState.providers[provider];
    syncState.providers[provider] = {
      ...current,
      connected,
      status: connected
        ? (['not_connected', 'auth_error'].includes(current.status) ? 'idle' : current.status)
        : 'not_connected',
      updatedAt: nowIso()
    };
    if (!connected) removeProviderQueue(syncState, provider);
  }
  const appleHealthConnected = isAppleHealthAvailable(appStore.getState().settings);
  syncState.providers.apple_health = {
    ...syncState.providers.apple_health,
    connected: appleHealthConnected,
    status: appleHealthConnected
      ? (syncState.providers.apple_health.status === 'not_connected' ? 'idle' : syncState.providers.apple_health.status)
      : 'not_connected',
    updatedAt: nowIso()
  };
  return persistSyncState(appStore, syncState);
}

export async function updateAppleHealthConnectionSnapshot(appStore) {
  const syncState = getSyncState(appStore.getState());
  const connected = isAppleHealthAvailable(appStore.getState().settings);
  syncState.providers.apple_health = {
    ...syncState.providers.apple_health,
    connected,
    status: connected
      ? (syncState.providers.apple_health.status === 'not_connected' ? 'idle' : syncState.providers.apple_health.status)
      : 'not_connected',
    updatedAt: nowIso()
  };
  if (!connected) removeProviderQueue(syncState, 'apple_health');
  return persistSyncState(appStore, syncState);
}

export async function setAutoSyncPreferences(appStore, patch = {}) {
  const syncState = getSyncState(appStore.getState());
  syncState.autoSync = {
    ...syncState.autoSync,
    ...patch,
    intervalMin: Math.max(5, Math.min(360, Number(patch.intervalMin ?? syncState.autoSync.intervalMin) || DEFAULT_AUTO_SYNC_INTERVAL_MIN))
  };
  return persistSyncState(appStore, syncState);
}

export async function clearRetryQueue(appStore, { failedOnly = false } = {}) {
  const syncState = getSyncState(appStore.getState());
  syncState.queue = failedOnly ? syncState.queue.filter(item => item.status !== 'failed') : [];
  for (const provider of SYNC_PROVIDERS) {
    const hasQueue = syncState.queue.some(item => item.provider === provider);
    if (!hasQueue && ['queued', 'failed'].includes(syncState.providers[provider].status)) {
      syncState.providers[provider] = {
        ...syncState.providers[provider],
        status: syncState.providers[provider].connected ? 'idle' : 'not_connected',
        retryCount: 0,
        nextRetryAt: null,
        updatedAt: nowIso()
      };
    }
  }
  return persistSyncState(appStore, syncState);
}

export async function retryQueuedSyncs(appStore, { force = false } = {}) {
  const syncState = getSyncState(appStore.getState());
  const now = Date.now();
  const due = syncState.queue.filter(item => {
    if (item.status === 'dismissed') return false;
    if (force) return true;
    return item.status === 'queued' && parseIsoMs(item.nextRetryAt) <= now;
  });
  const results = [];
  for (const item of due) {
    results.push(await syncProviderNow(appStore, item.provider, {
      days: item.days || 14,
      trigger: 'retry',
      throwOnError: false
    }));
  }
  return results;
}

export async function runAutoSync(appStore, { force = false, reason = 'app_open' } = {}) {
  let syncState = getSyncState(appStore.getState());
  if (!syncState.autoSync.enabled && !force) return { skipped: true, reason: 'disabled', results: [] };
  if (globalThis.navigator && globalThis.navigator.onLine === false) {
    return { skipped: true, reason: 'offline', results: [] };
  }

  try {
    if (getSyncBaseUrl(appStore.getState().settings)) await updateConnectionSnapshot(appStore);
    else await updateConnectionSnapshot(appStore, { providers: {} });
  } catch {
    // A Worker status failure must not block Apple Health or the retry queue.
  }

  const retryResults = await retryQueuedSyncs(appStore, { force });
  const retriedProviders = new Set(retryResults.map(item => item.provider));
  syncState = getSyncState(appStore.getState());
  const intervalMin = syncState.autoSync.intervalMin;
  const candidates = SYNC_PROVIDERS.filter(provider => {
    if (retriedProviders.has(provider)) return false;
    const providerState = syncState.providers[provider];
    if (!providerState.connected) return false;
    if (provider === 'apple_health' && !providerState.lastSuccessAt && !force) return false;
    return force || isProviderSyncDue(providerState, intervalMin);
  });

  const results = [...retryResults];
  for (const provider of candidates) {
    results.push(await syncProviderNow(appStore, provider, {
      days: syncState.providers[provider].lastSuccessAt ? 14 : 90,
      trigger: reason,
      throwOnError: false
    }));
  }

  syncState = getSyncState(appStore.getState());
  syncState.autoSync.lastRunAt = nowIso();
  syncState.autoSync.lastReason = reason;
  await persistSyncState(appStore, syncState);
  return { skipped: false, results };
}

export function initializeSyncLifecycle(appStore) {
  lifecycleStore = appStore;
  if (lifecycleInstalled || !globalThis.window) return;
  lifecycleInstalled = true;

  const runSoon = (reason, delay = 250) => {
    const timer = globalThis.setTimeout?.(() => {
      if (!lifecycleStore) return;
      runAutoSync(lifecycleStore, { reason }).catch(() => {});
    }, delay);
    timer?.unref?.();
  };

  globalThis.window.addEventListener('online', () => runSoon('online', 100));
  globalThis.document?.addEventListener('visibilitychange', () => {
    if (globalThis.document.visibilityState === 'visible') runSoon('visible', 250);
  });
  globalThis.window.addEventListener('focus', () => runSoon('focus', 300));

  retryTimer = globalThis.setInterval?.(() => {
    if (!lifecycleStore || (globalThis.navigator && globalThis.navigator.onLine === false)) return;
    retryQueuedSyncs(lifecycleStore).catch(() => {});
  }, 60_000);
  retryTimer?.unref?.();

  runSoon('app_open', 1200);
}

export function stopSyncLifecycle() {
  lifecycleStore = null;
  if (retryTimer) globalThis.clearInterval?.(retryTimer);
  retryTimer = null;
}
