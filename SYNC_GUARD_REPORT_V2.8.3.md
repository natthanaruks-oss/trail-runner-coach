# Sync guard report — v2.8.3

## Unchanged

- `workers/wearable-sync/src/index.js`
- `workers/apple-health-shortcut/src/index.js`
- Strava OAuth configuration and tokens
- Apple Health Bridge token and encryption key
- Cloudflare KV namespaces and bindings
- Health Auto Export REST endpoint and headers
- IndexedDB `DB_VERSION = 4`

## Changed

Frontend-only recovery date interpretation, Today readiness selection, unified display metadata, UX labels, verification and tests.

## Data control

- Source dates remain intact.
- Effective readiness dates are additive metadata.
- Daily movement is never carried into the next day.
- Missing metrics are not invented.
- Safety gates remain higher priority than readiness scores.
