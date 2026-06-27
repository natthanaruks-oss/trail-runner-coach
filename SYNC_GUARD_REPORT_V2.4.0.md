# Sync Guard Report — v2.4.0

## Unchanged sync-critical files

SHA-256 comparison against v2.3.0 confirmed these files are byte-for-byte unchanged:

- `workers/wearable-sync/src/index.js`
- `workers/apple-health-shortcut/src/index.js`
- `public/js/adapters/provider-sync.js`
- `public/js/adapters/sync-manager.js`
- `public/js/adapters/apple-health.js`
- `scripts/setup-strava.mjs`
- `scripts/lib/strava-setup.mjs`
- `scripts/setup-apple-health-shortcut.mjs`

## Unchanged contracts

- Strava Worker URL and OAuth routes
- Apple Health Shortcut Worker URL and API routes
- KV binding names
- Cloudflare Secret names and values
- Browser device token and provider token storage
- Apple Health Bridge Token
- `strava-setup-result.json` and Apple Health setup receipt formats
- IndexedDB schema version 4
- Activity deduplication and source-priority rules

## Deliberate non-sync changes

- New Apple Health insight selector for display and downstream-use context
- Today dashboard Apple Health snapshot and manual Pull Latest action
- Apple Health page trends and score-usage explanation
- Nutrition expenditure rule: use `BMR + Apple Active Energy` when Active Energy is present, avoiding duplicate activity-factor calories
- PWA cache and application version bump only
