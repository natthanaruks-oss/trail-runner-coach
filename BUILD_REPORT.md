# Build Report — Trail Runner Coach 2.1.0

## Scope delivered

**Google Health / Fitbit Sync** was added without removing the existing food, training, score calibration, analytics, backup or wearable workflows.

Delivered:

- Google Health / Fitbit provider in Connections, Auto Sync, Retry Queue and Activity Integrity.
- Google OAuth 2.0 web-server flow with CSRF state validation, offline access, encrypted refresh-token storage and token refresh.
- Google Health API v4 retrieval for exercise, sleep, daily resting heart rate, daily HRV, steps, active energy, active minutes, distance, weight and body fat.
- Normalization of official Google Health v4 date/time objects, exercise metric summaries and body-measurement records.
- Civil-date handling so daily recovery metrics remain aligned to the athlete's local calendar date.
- Partial-success warnings when one data type is unavailable while other valid data continues to import.
- Provider-neutral browser import into check-ins, body composition and canonical activities.
- Cross-provider workout deduplication against Apple Health, Strava and file imports.
- Bilingual Google Health / Fitbit Setup Wizard and one-command `npm run setup:google-health` workflow.
- Secret-free setup receipt and setup/readiness diagnostics.
- No Google Health public webhook is enabled in this release; sync uses authenticated API reads. A future webhook implementation must add Google subscriber/subscription provisioning and signed-event verification.
- No IndexedDB schema change; database remains version 4.

## Automated verification

- Repository verification: **passed** — 449 legacy foods + 1,375 prepared foods.
- Automated tests: **57/57 passed**.
- Google Health tests: setup config/receipt, official v4 payload normalization, Fitbit/Strava deduplication and secret-boundary status checks passed.
- Browser/IndexedDB integration and primary-route rendering passed.
- Main Cloudflare Worker dry-run: **passed — 73 public assets**.
- Wearable-sync Worker dry-run: **passed — 3 KV bindings**, Google Health scopes present.
- Cloud-backup Worker dry-run: **passed — 2 KV bindings**.
- `npm audit --omit=dev`: **0 vulnerabilities**.
- Full `npm audit`: **0 vulnerabilities**.

## Runtime and deployment

- Node.js: 22+
- Wrangler: 4.103.0
- Main Cloudflare Worker: `trail-runner-coaches`
- Optional wearable-sync Worker: `trail-runner-coach-wearable-sync`
- Optional cloud-backup Worker: `trail-runner-coach-cloud-backup`
- App/PWA cache version: 2.1.0
- IndexedDB: `trail_runner_coach`, schema version 4

## Security boundary

- Google OAuth Client Secret and provider refresh tokens are never bundled in `public/` or the setup receipt.
- OAuth tokens are encrypted with AES-GCM before Cloudflare KV storage.
- OAuth state is short-lived and bound to the requesting browser device hash.
- Callback return URLs are restricted to the configured `APP_ORIGIN`.
- `/setup/status` returns only credential-presence booleans and callback metadata.
- The current random device-token model is suitable for a personal prototype. Add authenticated user accounts and per-user authorization before a public multi-user deployment.

## Verified limitation

A live end-to-end Google authorization and data pull was not executed in this build environment because it requires the owner's Google Cloud project, OAuth Client ID/Secret, consent configuration and a Google account containing Fitbit/Google Health data. Code-level tests, official-shape fixtures, repository checks and Cloudflare dry-runs passed; live validation remains a deployment step for the project owner.
