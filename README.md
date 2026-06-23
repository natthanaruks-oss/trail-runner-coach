# Trail Runner Coach

Local-first adaptive trail running coach designed for long-term use across multiple races. The web app combines training plans, actual activity, strain, recovery, readiness, pain monitoring, rehab, nutrition, gear and body-composition history without requiring a project backend.

## Product principles

- **Athlete first:** readiness and pain can reduce the plan without treating recovery as failure.
- **Multi-race:** race profiles and training plans are separate domain objects. RTC 70 is included only as the initial seed profile.
- **Local-first:** browser data is stored in IndexedDB. Backup and restore use JSON.
- **Provider-neutral:** Apple Health, Garmin, Suunto, FIT/TCX/GPX and manual entry normalize into one schema.
- **Explainable:** strain and readiness show factors and confidence; they are decision support, not medical diagnosis.

## Repository structure

```text
public/                    Cloudflare static web app / PWA
  js/core/                 database, store, race and plan domain logic
  js/engines/              strain, recovery, readiness, recommendation
  js/adapters/             Apple Health bridge, importers, legacy migration
  js/data/                 plan template, rehab and guide data
  js/views/                route-level UI modules
ios/TrailRunnerCoach/      SwiftUI + HealthKit companion app
workers/wearable-sync/     optional Garmin/Suunto OAuth scaffold
test/                      Node unit and browser integration tests
docs/                      architecture, schema, scoring and integration notes
scripts/                   repository verification
```

## Web app setup

Requires Node.js 20 or newer.

```bash
npm install
npm test
npm run check
npm run dev
```

Deploy to Cloudflare Workers & Pages:

```bash
npm run deploy
```

`wrangler.jsonc` deploys `./public` to the Cloudflare Worker **`trail-runner-coaches`** and uses SPA fallback.

## Race and plan model

A `RaceProfile` contains date, distance, gain/loss, cut-off, start time, technical level and night-running requirements. A `TrainingPlan` contains a start date and weeks/sessions linked by `raceId`.

The bundled RTC 70 profile is starter data, not an application constant. New races can be created from **More → สนามเป้าหมาย**. The current 20-week plan may be cloned as a baseline, with Race Day distance and elevation synchronized to the selected profile.

## Apple Health

A normal website or PWA cannot access HealthKit directly. The companion app in `ios/TrailRunnerCoach` opens the deployed web app in `WKWebView`, requests HealthKit permission and passes normalized data to the page on-device.

On a Mac:

```bash
brew install xcodegen
cd ios/TrailRunnerCoach
xcodegen generate
open TrailRunnerCoach.xcodeproj
```

Then:

1. Change `PRODUCT_BUNDLE_IDENTIFIER` from `com.yourcompany.trailrunnercoach` to your unique identifier.
2. Select your Apple Development Team.
3. Confirm the HealthKit capability and usage descriptions.
4. Run on a physical iPhone.
5. Enter the deployed Cloudflare URL in the companion app.
6. Open **ข้อมูล & Wearables** and sync Apple Health.

## Privacy and source control

Do not commit personal exports, InBody records, Apple Health exports, activity files, OAuth tokens or secrets. The `.gitignore` already excludes common private-data paths and file types.

The previously generated personal InBody import remains compatible because the importer accepts both the current schema and the legacy `rtc70-body-composition` schema. Keep that file outside the repository.

## Current boundaries

- Apple Health requires building the iOS companion on macOS/Xcode and testing on a physical iPhone.
- Garmin and Suunto live sync are scaffolded but still require provider approval, OAuth credentials and a Worker deployment.
- The bundled 20-week plan is a baseline template; future plan generation should account for race distance, vertical, technicality, training history, injury risk and available weeks rather than scaling distance alone.

## Build runtime

Cloudflare Workers Builds must use Node.js 22.16.0 or newer. The repository pins this through `.node-version`, and Wrangler is pinned to 4.103.0.
