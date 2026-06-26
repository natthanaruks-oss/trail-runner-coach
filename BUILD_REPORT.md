# Build Report — Trail Runner Coach 2.2.0

## Scope delivered

**Mobile App UX & Navigation** was delivered as a reversible frontend refactor. The release changes navigation, layout and presentation while preserving the established wearable-sync and data-storage boundaries.

Delivered:

- Five-item daily navigation: Today, Plan, Train, Food and More.
- Grouped More control center for health journal, progress, body data, connections, data hub, encrypted backup, race, gear, nutrition and settings.
- New compact Devices & Connections page for normal Connect, Sync, Sync All and status-refresh actions.
- Existing full Connections page retained as Advanced Setup & Troubleshooting.
- Health Journal no longer embeds the full setup wizard, reducing page length and unnecessary rendering.
- Mobile viewport, safe-area and `100dvh` handling.
- 16 px mobile form controls to prevent browser auto-zoom.
- Solid mobile header/navigation surfaces with reduced blur and shadows.
- Bottom-sheet dialogs on small screens.
- PWA standalone metadata and installed-app status guidance.
- CSP retains access to `https://trail-runner-coach-wearable-sync.natthanaruk-s.workers.dev`.
- IndexedDB remains schema version 4.

## Sync preservation evidence

The following runtime files are byte-for-byte unchanged from the uploaded v2.1.0 package:

- `workers/wearable-sync/src/index.js`
- `public/js/adapters/provider-sync.js`
- `public/js/adapters/sync-manager.js`
- `public/js/core/db.js`
- `public/js/core/store.js`
- `public/js/views/connections.js`

Only the application version constant, PWA cache name and CSP/header configuration changed around the sync boundary. No KV namespace name, OAuth route, token key, device token key, provider endpoint, database schema or record format was changed.

## Automated verification

- Repository verification: **passed** — 449 legacy foods + 1,375 prepared foods.
- Automated tests: **57/57 passed**.
- Browser/IndexedDB integration and primary-route rendering: **passed**.
- New More and compact Connections routes: **passed** in integration coverage.
- `npm audit`: **0 vulnerabilities** after clean install.

## Runtime and deployment

- Node.js: 22+
- Wrangler: 4.103.0
- Main app package/cache version: 2.2.0
- Wearable-sync Worker runtime version: 2.1.0 (intentionally unchanged)
- IndexedDB: `trail_runner_coach`, schema version 4

## Deployment note

Deploy the root project normally. The root `wrangler.jsonc` publishes only the `public/` application assets. It does not redeploy the optional wearable-sync Worker, so the existing live Worker, KV bindings, secrets and stored tokens remain in place.
