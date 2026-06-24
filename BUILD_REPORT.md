# Build Report — Trail Runner Coach 1.2.1

## Scope delivered

- Preserved all v1.1 primary workflows: Today, Plan, Train, Food and Log.
- Preserved the 449-food catalog, custom foods, catalog overrides, water, energy balance, rehab, pain, body, sleep, backup and legacy migration.
- Added user-facing Strain 0–21, Recovery 0–100 and Readiness 0–100.
- Added workout + behavior Strain, including trail, vertical gain/loss, downhill, night running, steps, active energy and exercise minutes.
- Added personalized RHR/HRV/Sleep baselines and recent Strain context to Recovery.
- Added Data Confidence, score drivers, baseline maturity and a 14-day score detail page.
- Added configurable sleep target.
- Retained Pain Safety Gate and wearable-only Yellow cap.

## Verification evidence

- Repository verification: passed.
- Bundled food records: 449.
- Automated tests: 16/16 passed.
- Browser/IndexedDB integration test: passed, including the new `#/scores` route.
- Legacy backup migration test: passed.
- Nutrition CRUD and catalog override integration: passed.
- Strain 0–21 behavior-only load test: passed.
- High previous Strain reducing Recovery test: passed.
- Pain ≥6 forcing Red Readiness test: passed.
- Cloudflare Wrangler 4.103.0 dry-run: passed; 57 public asset files detected.
- npm audit: 0 vulnerabilities.

## Runtime and deployment

- Node: 22.16.0
- Wrangler: 4.103.0
- Cloudflare Worker name: `trail-runner-coaches`
- Static asset directory: `./public`
- Package/application/PWA cache version: 1.2.1
- IndexedDB database: `trail_runner_coach`, schema version 4

Recommended Cloudflare settings when automatic npm install is disabled:

```text
SKIP_DEPENDENCY_INSTALL=true
Build command: leave blank, or echo "No build step"
Deploy command: pnpm dlx wrangler@4.103.0 deploy
Root directory: /
```

Do not enter the literal word `None` in Build command.

## Privacy check

The deploy package excludes `node_modules`, `.wrangler`, `.env`, Apple Health exports, InBody imports, FIT/TCX/GPX files, user backups and signing data.


## UI verification

- Native Thai/English font stack; no external font files or CDN dependency.
- Unsupported synthetic weights (750/850/900) are visually overridden with 600/650/700.
- Bottom navigation and quick-add icons use inline SVG rather than font glyphs.
- Mobile breakpoints checked for 360 px and 520 px widths.

## Verified on 24 June 2026

- `npm run check`: passed — 16/16 tests.
- Repository verification: passed — 449 bundled foods retained.
- `wrangler deploy --dry-run`: passed — 57 public assets detected.
- CSS structural check: balanced braces.
- No `node_modules`, `.wrangler`, `.env`, Apple Health export or personal InBody payload included in the deploy package.
