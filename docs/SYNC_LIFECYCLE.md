# Auto Sync, Last Sync and Retry Queue

Version 1.7.0 adds a browser-side synchronization lifecycle without changing the IndexedDB schema.

## Goals

- Show connection and synchronization status separately.
- Preserve the last successful sync even when a later attempt fails.
- Retry temporary network and provider failures without creating duplicate activities.
- Stop retrying authorization, missing-connection and pending-provider-adapter errors.
- Keep the app local-first: imported health and activity data remains in IndexedDB.

## Provider state

The metadata record `provider_sync_state_v1` stores one state object per provider:

- `connected`
- `status`: idle, syncing, success, queued, failed, error, auth_error, not_connected or pending
- `lastAttemptAt`
- `lastSuccessAt`
- `lastFailureAt`
- `lastError`
- `lastResult`
- `retryCount`
- `nextRetryAt`

The record lives in the existing `metadata` store, so IndexedDB remains schema version 4.

## Automatic triggers

When Auto Sync is enabled, the app checks synchronization when:

1. the app opens;
2. the browser returns online;
3. the tab becomes visible;
4. the window regains focus; or
5. a retry item reaches its scheduled time while the app is open.

The default minimum interval between successful provider syncs is 30 minutes. Users can select 15, 30, 60 or 120 minutes.

Apple Health is only auto-synced after at least one successful manual HealthKit sync. This avoids presenting an unexpected HealthKit permission prompt on first launch. Cloud providers are auto-synced only when their Worker connection status is active.

## Retry policy

Temporary errors are queued with backoff:

1. 1 minute
2. 5 minutes
3. 15 minutes
4. 1 hour
5. 6 hours

Provider `Retry-After` headers override the default delay within a safe range. After five failed attempts the item remains visible as `failed` and requires a manual retry.

Retryable conditions include:

- offline/network failures;
- timeout-like failures;
- HTTP 429 rate limits;
- HTTP 5xx provider/Worker failures.

The app does not automatically retry:

- a disconnected provider;
- authorization errors;
- Garmin/Suunto adapters that are still pending approved API access;
- invalid requests or data errors.

## Duplicate protection

Every successful activity import passes through the v1.6 cross-provider deduplication pipeline. Retrying the same provider response therefore updates or merges canonical activities instead of adding duplicate Strain.

## Limitations

The browser cannot run continuously when the PWA is fully closed or suspended by the operating system. The persisted queue resumes the next time the app opens, becomes visible or returns online. True server-push ingestion for closed clients requires a later cloud-sync architecture and is outside Step 3.
