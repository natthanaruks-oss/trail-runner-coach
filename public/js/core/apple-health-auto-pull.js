import { syncProviderNow, getSyncState } from '../adapters/sync-manager.js';
import { isAppleHealthAvailable } from '../adapters/apple-health.js';

const ATTEMPT_KEY = 'trc.appleHealthAutoPullAt.v1';
const MIN_ATTEMPT_GAP_MS = 2 * 60 * 1000;
const STALE_AFTER_MS = 15 * 60 * 1000;

export function shouldAutoPullAppleHealth(state, health, now = Date.now()) {
  if (!isAppleHealthAvailable(state?.settings)) return false;
  const syncState = getSyncState(state);
  const provider = syncState.providers.apple_health;
  const lastAttempt = Math.max(
    parseTime(provider?.lastAttemptAt),
    sessionAttemptTime()
  );
  if (lastAttempt && now - lastAttempt < MIN_ATTEMPT_GAP_MS) return false;
  if (!health?.hasData) return true;
  const lastSuccess = parseTime(provider?.lastSuccessAt || health?.lastImportedAt);
  return !lastSuccess || now - lastSuccess >= STALE_AFTER_MS;
}

export async function autoPullAppleHealth(app, { days = 90, trigger = 'auto_view' } = {}) {
  const state = app.store.getState();
  if (!isAppleHealthAvailable(state.settings)) return null;
  markAttempt();
  return syncProviderNow(app.store, 'apple_health', {
    days,
    trigger,
    resetRetry: true
  });
}

export function markAttempt(now = Date.now()) {
  try { globalThis.sessionStorage?.setItem(ATTEMPT_KEY, String(now)); }
  catch { /* storage may be unavailable */ }
}

export function latestAppleHealthProviderState(state) {
  return getSyncState(state).providers.apple_health;
}

function sessionAttemptTime() {
  try { return Number(globalThis.sessionStorage?.getItem(ATTEMPT_KEY) || 0) || 0; }
  catch { return 0; }
}

function parseTime(value) {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}
