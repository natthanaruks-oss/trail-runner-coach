# Build Report — Trail Runner Coach 1.3.0

## Scope delivered

- Preserved all primary workflows: Today, Plan, Train, Food and Log.
- Preserved Strain 0–21, Recovery 0–100, Readiness 0–100, Pain Safety Gate, Rehab, Plan, Body, Sleep, Backup and legacy migration.
- Expanded the food catalog from 449 to **1,824 records** by adding 1,375 estimated Thai prepared foods.
- Added lazy food-data loading, Thai/English search, expanded category filters and gram-based portion entry.
- Added calorie deficit/surplus analysis for 7/14/30/90-day and custom date filters.
- Added complete-day coverage protection, deficit/surplus totals, net offset, average deficit and theoretical weight trend.
- Added Apple Health, Garmin, Suunto and Strava connection center.
- Implemented Strava OAuth/sync Worker path; created Garmin/Suunto secure OAuth boundaries pending provider access.
- Removed full-store refresh after normal writes and preserved per-route scroll to reduce flicker and jump-to-top behavior.

## Verification evidence

- Repository verification: passed.
- Legacy bundled foods: 449.
- Added Thai prepared foods: 1,375.
- Total searchable food records: 1,824.
- Automated tests: **18/18 passed**.
- Browser/IndexedDB route integration: passed, including `#/connections`.
- Food CRUD, catalog override and expanded dataset tests: passed.
- Custom filtered calorie-deficit test: passed.
- Legacy backup migration test: passed.
- Strain/Recovery/Readiness safety tests: passed.
- JavaScript syntax checks: passed.
- Cloudflare Wrangler 4.103.0 dry-run: passed; **62 public asset files** detected.
- npm audit: **0 vulnerabilities**.

## Runtime and deployment

- Node: 22.16.0
- Wrangler: 4.103.0
- Cloudflare Worker name: `trail-runner-coaches`
- Static asset directory: `./public`
- Package/application/PWA cache version: 1.3.0
- IndexedDB database: `trail_runner_coach`, schema version 4

Recommended Cloudflare settings when automatic npm install is disabled:

```text
SKIP_DEPENDENCY_INSTALL=true
Build command: leave blank, or echo "No build step"
Deploy command: pnpm dlx wrangler@4.103.0 deploy
Root directory: /
```

Do not enter the literal word `None` in Build command.

## Interaction verification

- Normal record writes update IndexedDB and local in-memory state without calling a full `refreshAll()`.
- Same-route renders retain the current scroll position.
- Route changes store and restore independent scroll positions.
- Browser history scroll restoration is manual.
- No global opacity/loading transition is used for routine saves.
- Stable scrollbar and disabled overflow anchoring reduce layout jumps.

## Provider integration status

- Apple Health: native HealthKit companion source is included; Xcode signing and physical-iPhone testing are still required.
- Strava: OAuth, token refresh, webhook endpoint and recent activity normalization are implemented; API app credentials and Worker deployment are required.
- Garmin: OAuth/security boundary is ready; live Health/Activity mapping requires Developer Program approval and granted documentation/scopes.
- Suunto: OAuth/security boundary is ready; live workout/FIT mapping requires partner approval and granted endpoint details.

## Privacy check

The deploy package excludes `node_modules`, `.wrangler`, `.env`, Apple Health exports, InBody imports, FIT/TCX/GPX files, user backups, OAuth secrets and signing data.

## Verified on 24 June 2026

- `npm run check`: passed — 18/18 tests.
- `wrangler deploy --dry-run`: passed — 62 public assets.
- `npm audit --omit=dev`: 0 vulnerabilities.
