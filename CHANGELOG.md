# Changelog

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
