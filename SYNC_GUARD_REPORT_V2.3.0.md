# Sync Guard Report — v2.3.0

## Protected Strava files

The SHA-256 hash of each file below is identical to the uploaded v2.2.0 package:

| File | Result |
|---|---|
| `workers/wearable-sync/src/index.js` | unchanged |
| `public/js/adapters/provider-sync.js` | unchanged |
| `scripts/setup-strava.mjs` | unchanged |
| `scripts/lib/strava-setup.mjs` | unchanged |

## Protected runtime contracts

Unchanged:

- Strava Worker name and URL
- OAuth start/callback routes
- Client ID/Client Secret locations
- KV binding names and existing token records
- Browser device token key
- Activity external IDs and dedup engine
- IndexedDB database name and schema version

## Shared code change

`public/js/adapters/sync-manager.js` now selects either the existing native HealthKit bridge or the new Apple Health Shortcuts bridge for the `apple_health` provider. Strava execution still calls the unchanged `syncProviderActivities()` path.

A dedicated `updateAppleHealthConnectionSnapshot()` function updates only Apple Health state. It does not overwrite Strava/Google/Garmin/Suunto connection state.

## Regression evidence

- Existing Strava setup tests passed.
- Existing provider sync/retry tests passed.
- Cross-provider activity dedup tests passed.
- Full application integration test passed in Thai and English.
- Total: 60/60 tests passed.
