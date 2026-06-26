# Build Report — Trail Runner Coach v2.3.0

## Scope

Added Apple Health Shortcuts Bridge as a new, separate integration path for recovery and body metrics.

## Verification

- `npm run check`: **60/60 tests passed**
- `npm run deploy:dry-run`: **passed**
- Static assets detected: **75 files**
- npm audit: **0 vulnerabilities**
- IndexedDB schema: **version 4 unchanged**

## New components

- `workers/apple-health-shortcut/`
- `scripts/setup-apple-health-shortcut.mjs`
- `scripts/lib/apple-health-shortcut-setup.mjs`
- `public/js/views/apple-health-shortcut.js`
- Apple Health Shortcuts transport in `public/js/adapters/apple-health.js`
- Apple-only connection-state update in `public/js/adapters/sync-manager.js`
- `docs/APPLE_HEALTH_SHORTCUTS_BRIDGE.md`
- `examples/apple-health-shortcut-payload.example.json`
- `test/apple-health-shortcut.test.js`

## Security controls

- Separate Worker and KV namespace from Strava.
- Bearer token generated automatically by setup script.
- AES-GCM encryption before payload is stored in KV.
- Bridge token excluded from normal app backup exports.
- Sensitive setup receipt uses `.local.json` and is excluded by `.gitignore`.
- Request payload limited to 256 KB and numeric ranges are validated.
