# Build Report — Trail Runner Coach 1.0.1

Build date: 23 June 2026

## Deployment-name update

- Cloudflare Worker/project name: `trail-runner-coaches`.
- GitHub repository and npm package remain `trail-runner-coach`.
- Product display name remains **Trail Runner Coach**.
- IndexedDB and local application identifiers are unchanged, preventing unnecessary local-data migration.

## Scope completed

- Product, repository, PWA, Cloudflare and iOS naming changed to Trail Runner Coach.
- RTC 70 moved from application identity to an initial `RaceProfile` seed.
- Added IndexedDB stores for `raceProfiles` and `trainingPlans`.
- Added active race/plan selection and race CRUD UI.
- New race profiles can clone the bundled 20-week plan template; Race Day date, distance and elevation are injected from the selected race.
- Session identifiers are plan-scoped to avoid collisions across multiple race plans.
- Apple Health bridge renamed to `trailRunnerHealthKit` and `window.TrailRunnerCoachHealth`.
- iOS companion renamed and restricted to the configured HTTPS host.
- Backup, service-worker cache, package, Worker scaffold and documentation renamed.
- Legacy RTC backup and InBody import compatibility retained.
- Personal InBody and Apple Health data are not included in the repository package.

## Verification performed

- Repository verification script: passed.
- Node unit and browser integration tests: 12/12 passed.
- Multi-race creation through the browser UI: passed in integration test.
- Red pain safety gate: passed.
- Apple Health payload normalization: passed.
- Current and legacy InBody schemas: passed.
- Cloudflare Wrangler deploy dry-run: passed.
- Swift source parse: passed.
- iOS Info.plist validation: passed.
- iOS HealthKit entitlement plist validation: passed.
- npm audit after install: 0 vulnerabilities reported.

## Deployment boundaries

- The Cloudflare web app is deploy-ready.
- Apple Health live access still requires macOS, Xcode, a unique bundle identifier, an Apple Development Team and a physical iPhone.
- Garmin and Suunto remain optional future integrations and require provider credentials plus a secure Worker/OAuth implementation.
- The 20-week template is a starting baseline, not yet a fully generated plan for every race distance and athlete history.
