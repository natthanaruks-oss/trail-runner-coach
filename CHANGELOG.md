# Changelog

## 2.2.0 — Mobile App UX & Navigation

- Rebuilt the primary journey around five daily destinations: Today, Plan, Train, Food and More.
- Replaced the overloaded Log bottom tab with a grouped More control center while retaining every existing route and record type.
- Added a compact Devices & Connections screen for daily Connect/Sync actions; the existing setup wizard and troubleshooting screen remain available under Advanced Settings.
- Removed the full Connections wizard from the Health Journal tab, reducing initial DOM size and avoiding unnecessary setup/status work during normal logging.
- Added mobile-safe viewport behavior, 16 px form controls to prevent automatic browser zoom, safe-area spacing, `100dvh`, bottom-sheet dialogs and horizontal-overflow protection.
- Reduced mobile blur and shadow effects to improve scrolling and rendering performance.
- Added installed-app metadata and a clearer standalone/PWA experience.
- Preserved the wearable Worker, provider adapters, sync manager, IndexedDB schema, store logic, KV bindings, OAuth routes and token records unchanged.
- Retained the required CSP permission for the deployed wearable Worker domain.
- Bumped package, application and PWA cache versions to 2.2.0; wearable Worker runtime remains 2.1.0 because no sync-runtime change was made.
- Repository verification and all 57 automated tests passed.

## 2.1.0 — Google Health / Fitbit Sync

- Added Google Health / Fitbit as a first-class cloud provider in Connections, Sync status, Retry Queue and Activity Integrity.
- Added a Google OAuth 2.0 web-server flow with offline access, CSRF state validation, encrypted token storage and refresh-token support in the shared wearable-sync Worker.
- Added live Google Health API data-point retrieval for exercise, sleep, daily resting heart rate, daily HRV, steps, active energy, active minutes, distance, weight and body fat.
- Added partial-success handling so an unavailable data type produces a warning without discarding other valid provider data.
- Added browser-side normalization and import into daily check-ins, body composition and canonical activities.
- Routed Google Health/Fitbit workouts through cross-provider deduplication to prevent double-counting with Strava, Apple Health and file imports.
- Added a bilingual Google Health / Fitbit Setup Wizard and one-command `npm run setup:google-health` workflow.
- Added secret-free setup receipt import, readiness checks and provider-specific connection/sync controls.
- Added Google Health setup, normalization, deduplication and secret-boundary tests; complete automated suite is now 57/57.
- Validated official v4 Date, CivilDateTime, ObservationSampleTime, exercise metrics, HRV and active-minutes shapes in automated fixtures.
- Google Health webhooks are intentionally not enabled in 2.1.0; authenticated API sync is used until subscriber provisioning and signed-event verification are implemented.
- Preserved IndexedDB schema version 4 and all food, training, backup, score-calibration and analytics workflows.
- Bumped package, app, wearable Worker and PWA cache versions to 2.1.0.

## 2.0.0 — Encrypted Cloud Backup

- Added a zero-knowledge encrypted cloud-backup route and bilingual setup workflow.
- Added client-side PBKDF2-SHA-256 key derivation, AES-GCM-256 encryption, gzip compression when available, and plaintext SHA-256 verification.
- Added versioned Cloudflare KV storage with hashed access tokens, retention pruning, no-store responses, and a 12 MiB encrypted payload limit.
- Added `npm run setup:backup` to create KV bindings, deploy the backup Worker, and generate a secret-free setup receipt.
- Added Recovery Kit export/import for connecting a new device without storing the passphrase.
- Added manual backup, encrypted version listing, local decryption, record preview, Merge restore, Replace restore, version deletion, device disconnect, and permanent vault deletion.
- Added optional automatic backup while the app is open and the remembered local key is available.
- Added dedicated crypto, setup, Worker API, bilingual UI, and browser integration tests.
- Preserved IndexedDB schema version 4 and all previous food, plan, wearable, calibration, progress, and local JSON backup workflows.
- Bumped package, app, and PWA cache versions to 2.0.0.

## 1.9.0 — Progress Dashboard

- Added a bilingual filterable Progress Dashboard for 7, 28, 90-day and custom date ranges up to 366 days.
- Added equal-length previous-period comparisons for distance, elevation, duration, adherence, scores, pain and energy balance.
- Added consolidated training metrics for run/walk/hike distance, vertical gain/loss, duration, active days, trail sessions and night runs.
- Added planned-versus-actual distance and vertical charts using the active training plan and deduplicated activities.
- Added normalized Strain, Recovery and Readiness trend visualization with Green/Yellow/Red day counts.
- Added Pain/Niggle trend, hard-stop detection, worst-area summary and period-half trend comparison.
- Added complete-day calorie balance, coverage and average deficit/surplus context.
- Added explainable progress insights and a transparent data-coverage confidence indicator.
- Excluded cycling and strength distance from trail-running volume totals while keeping their duration in total training time.
- Added Progress access from Today and Log without changing the five-item bottom navigation.
- Added three dedicated progress-engine tests and expanded the full automated suite to 45/45.
- Preserved IndexedDB schema version 4 and all existing food, sync, calibration, deduplication and bilingual workflows.
- Bumped package, application and PWA cache version to 1.9.0.

## 1.8.0 — Personal Score Calibration

- Added a daily 30-second calibration feedback loop for perceived readiness, perceived Strain and session outcome.
- Added guarded calibration phases: Bootstrap (0–6 usable days), Learning (7–20) and Personalized (21+).
- Added bounded Readiness bias correction (±10 points) and Strain correction (±2.5 on the 0–21 scale).
- Added feedback-derived Recovery component weight modifiers constrained to ±15%.
- Added rolling robust RHR and HRV baselines using median and MAD-based spread, reducing sensitivity to single-day outliers.
- Applied feedback only to future scores, preventing same-day self-fitting.
- Preserved Pain/Illness Safety Gates above all personalization and prevented calibration from overriding Red conditions.
- Added calibration phase, confidence, baseline ranges, learned factor weights and feedback history to the score page.
- Stored calibration feedback in the existing metadata store; IndexedDB remains schema version 4.
- Added six calibration tests and expanded the complete automated suite to 42/42.
- Preserved all food, calorie, training, bilingual, sync, deduplication and legacy workflows.
- Bumped package, application and PWA cache version to 1.8.0.

## 1.7.0 — Auto Sync Status, Last Sync & Retry Queue

- Added a persistent provider-sync state model for Apple Health, Garmin, Suunto and Strava.
- Added automatic sync checks on app open, online recovery, tab visibility and window focus.
- Added user-selectable 15/30/60/120-minute auto-sync intervals.
- Added Last Attempt, Last Success, Last Failure, Last Result and next retry visibility per provider.
- Added a persistent retry queue with 1m/5m/15m/1h/6h backoff and a five-attempt manual-attention boundary.
- Added Retry-After support for provider rate limits and Worker responses.
- Added Sync All, Retry Now and Clear Queue controls.
- Prevented retries for disconnected, authorization and pending-provider-adapter errors.
- Routed every retry through the cross-provider deduplication pipeline.
- Added dedicated sync-manager tests; full automated suite is now 36/36.
- Preserved IndexedDB schema version 4 and all v1.6 features.
- Bumped package, app, Worker and PWA cache versions to 1.7.0.

## 1.6.0 — Cross-provider Activity Deduplication

- Added provider-neutral activity identity normalization with persistent source provenance.
- Added exact update matching by provider plus external activity ID.
- Added high-confidence cross-provider matching using start time, duration, distance, activity type and average heart rate.
- Added field-level merge priorities so useful metrics are combined instead of one provider blindly overwriting another.
- Added Canonical Activity records with `sources`, `externalRefs`, fingerprint and merge metadata.
- Added a safe review queue for uncertain matches with user actions to merge or keep records separate.
- Added one-time reconciliation for historical activities and automatic deduplication during Apple Health, cloud-provider and file imports.
- Added Activity Integrity status to Data & Wearables.
- Added seven dedicated deduplication tests; complete automated suite is now 32/32.
- Preserved all v1.5 Strava Wizard, bilingual, food, calorie, training and Strain/Recovery workflows.
- Kept IndexedDB schema version 4 and bumped application/PWA cache version to 1.6.0.

## 1.5.0 — Strava Setup Wizard

- Added a four-stage bilingual Strava Setup Wizard under Connections.
- Added callback-domain prediction for Cloudflare workers.dev deployments.
- Added `npm run setup:strava` to automate Cloudflare login, KV creation/binding, secure secret upload and Worker deployment.
- Added a secret-free `strava-setup-result.json` receipt that can be imported into the web app.
- Added `/setup/status` to validate App Origin, KV bindings, required Strava secrets and overall readiness without exposing credentials.
- Added copy controls for callback domain, callback URL and the setup command.
- Added required-secret declarations to the optional wearable Worker configuration.
- Added automated tests for config generation, receipt safety, deployed URL parsing and secret-safe setup status.
- Preserved all v1.4 food, calorie, strain/recovery, bilingual, training and legacy workflows.
- Kept IndexedDB schema version 4 and bumped application/PWA cache version to 1.5.0.

## 1.4.0 — Thai / English Bilingual UI

- Added persistent Thai/English language switching from the header and Settings.
- Localized the five primary workflows and all supporting routes, including forms, dialogs, status messages, safety warnings, rehab cues, nutrition guidance, gear and wearable setup.
- Added language-aware date and number formatting.
- Added bilingual food handling with `nameTh` / `nameEn` and safe fallback for custom foods.
- Added centralized `core/i18n.js` helpers for static strings, dynamic patterns and structured bilingual fields.
- Prevented unsafe partial word replacement that could create mixed Thai/English sentences.
- Preserved user-entered notes and motivation text in the language originally entered.
- Added bilingual browser integration coverage and dedicated i18n unit tests.
- Kept IndexedDB schema version 4 so existing local data remains available.
- Bumped package, application and PWA cache version to 1.4.0.

## 1.3.0 — Food Expansion, Deficit Filters, Connections & Smooth UI

- Added 1,375 Thai prepared foods to the existing 449-item catalog for 1,824 searchable records in total.
- Lazy-loads the expanded dataset only when the food picker opens to limit startup cost.
- Added Thai/English/subcategory search, new food groups and gram-based portion entry.
- Added 7/14/30/90-day and custom date-range calorie-deficit filters.
- Added deficit, surplus, net offset, coverage, complete-day count, average deficit and theoretical weight-trend summaries.
- Deficit analysis now excludes incomplete food-log days and warns when data coverage is low.
- Added a Connections center for Apple Health, Garmin, Suunto and Strava.
- Added provider-neutral browser adapter and a random local device token.
- Implemented Strava OAuth, token refresh, webhook and recent activity sync in the optional Worker.
- Added secure OAuth boundaries for Garmin and Suunto pending provider approval and granted API endpoints.
- Refactored store writes to update in-memory state without re-reading every IndexedDB store after each action.
- Preserved scroll position on same-route updates and per-route navigation; removed unconditional scroll-to-top behavior.
- Added stable scrollbar and reduced loading-state repaint/flicker.
- Expanded automated verification to 18 tests and 62 public assets.
- Bumped package, application and PWA cache version to 1.3.0.

## 1.2.1 — Typography & Bevel-inspired UI polish

- Replaced the mixed Inter/fallback stack with native Apple/Thai/Windows system fonts for consistent offline rendering.
- Normalized font weights and minimum label sizes to prevent synthetic or unusually small text.
- Rebuilt primary navigation icons as inline SVG so they do not depend on symbol fonts.
- Refined cards, rings, spacing, tab controls, forms and bottom navigation with a cleaner health-dashboard visual language.
- Kept all v1.2.0 Strain, Recovery, Readiness, food logging, rehab and legacy workflows unchanged.
- Bumped application and PWA cache version to 1.2.1.

## 1.2.0 — Strain & Recovery Engine

- Added three visible daily scores: Strain 0–21, Recovery 0–100 and Readiness 0–100.
- Added a provider-neutral daily Strain model combining workout load, trail mechanical load, downhill, night running and Apple Health behavior metrics.
- Added personalized Recovery baselines for Sleep target, Resting HR and HRV with baseline maturity and Data Confidence.
- Added previous-day and three-day Strain context to Recovery.
- Added a detailed score page with 14-day trends, positive/negative drivers and transparent calculation notes.
- Kept Pain Safety Gate above all wearable scores and retained the wearable-only Yellow cap until subjective checks are complete.
- Added athlete sleep-target setting and expanded automated tests to 16.
- Preserved every v1.1 food, training, plan, log and migration workflow.
- Bumped PWA cache and application version to 1.2.0.

## 1.1.0 — Legacy Feature Parity

- Restored the five primary workflows: Today, Plan, Train, Food and Log.
- Restored the legacy food workflow with 449 searchable food records, categories, recent foods, portion selection, custom foods, daily edit/delete and water tracking.
- Added user overrides so catalog foods can be edited, hidden and reset without modifying the bundled source catalog.
- Added complete-day flags and 7/14/30-day energy-balance trends.
- Added BMR, activity-factor, protein and hydration settings while prioritizing adequate fueling during Build/Peak.
- Restored Rehab, Strength, Running Drills and home-equipment tracking.
- Consolidated Motivation, Pain, Body/Weight, Sleep/RHR and Data access under Log.
- Expanded legacy backup migration for food, custom foods, water, sleep, RHR, weight and equipment.
- Added IndexedDB stores for food logs, custom food/overrides, water and daily flags; database schema is now version 4.
- Bumped PWA cache and application version to 1.1.0.

## 1.0.2 — Node 22 build runtime

- Updated Cloudflare build runtime to Node.js 22.16.0.
- Pinned Wrangler to 4.103.0.

## 1.0.1 — Cloudflare deployment name

- Changed the Cloudflare Worker name to `trail-runner-coaches`.

## 1.0.0 — Trail Runner Coach foundation

- Introduced multi-race profiles, IndexedDB, adaptive readiness engines and Apple Health bridge foundation.
