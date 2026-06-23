# Changelog

## 1.0.1 — Cloudflare deployment name

- Changed only the Cloudflare Worker name in `wrangler.jsonc` to `trail-runner-coaches`.
- Kept the product, GitHub repository, npm package, IndexedDB, PWA and iOS app names unchanged.
- Updated deployment documentation to prevent accidental renaming of application data identifiers.

## 1.0.0 — Trail Runner Coach foundation

- Renamed the product, repository, Cloudflare project, PWA and iOS companion.
- Replaced RTC-specific application settings with `RaceProfile` and `TrainingPlan` stores.
- Added active race/plan selection and a race-management screen.
- Made planned-session IDs plan-scoped to prevent collisions across races.
- Kept RTC 70 only as initial seed data and a bundled 20-week template.
- Renamed the Apple Health WKWebView bridge to provider-neutral product identifiers.
- Changed IndexedDB to `trail_runner_coach` version 3.
- Updated backup names, service-worker cache and privacy exclusions.
- Retained import compatibility for earlier RTC70 backups and InBody schema.

## 1.0.2 — 2026-06-24

- Updated Cloudflare build runtime from Node.js 20 to Node.js 22.16.0.
- Pinned Wrangler to 4.103.0 to prevent unplanned CLI upgrades.
- Updated package engine requirement to Node.js >=22.0.0.
