# Build Report — Trail Runner Coach 1.1.0

Build date: 24 June 2026

## Scope completed

- Rebuilt the useful `roadtopyc70` workflows on the current modular and IndexedDB foundation.
- Kept multi-race planning, readiness/strain/recovery engines and Apple Health architecture.
- Restored the five primary workflows: Today, Plan, Train, Food and Log.
- Added 449 searchable legacy food records with category, recent-food and portion workflows.
- Added daily food CRUD, custom food CRUD, catalog edit/hide/reset through non-destructive user overrides, water tracking and complete-day flags.
- Added energy-balance trends for 7/14/30 days with incomplete-day protection.
- Restored Rehab, Strength, Running Drills, home equipment, Motivation, Pain, Weight/Body and Sleep/RHR workflows.
- Expanded old-backup migration for food, custom foods, water, sleep, resting HR, pain, body weight and equipment.
- Full JSON backup now includes all version-4 IndexedDB stores.
- No personal InBody, Apple Health or activity data is included in the repository package.

## Verification performed

- Repository verification: passed; 449 bundled food records detected.
- JavaScript syntax and module loading: passed.
- Automated tests: **14/14 passed**.
- Browser integration: primary routes, multi-race creation, food custom-entry workflow, catalog override, hide and restore: passed.
- Nutrition totals and complete-day energy balance: passed.
- Legacy backup migration for food, water, sleep, RHR, pain, body and equipment: passed.
- Pain ≥6 readiness safety gate: passed.
- Apple Health normalization and current/legacy InBody schema tests: passed.
- Cloudflare Wrangler 4.103.0 deploy dry-run: passed; 56 public assets read.
- Fresh `npm ci` from package-lock without an existing `node_modules`: passed.
- npm audit: **0 vulnerabilities**.

## Deployment configuration

- Node: 22.16.0
- Cloudflare Worker: `trail-runner-coaches`
- Static assets: `./public`
- SPA fallback: enabled
- Package/application version: 1.1.0
- IndexedDB schema: version 4

For the current Cloudflare npm installer issue, keep `SKIP_DEPENDENCY_INSTALL=true`, leave Build command empty (or use `echo "No build step"`) and use `pnpm dlx wrangler@4.103.0 deploy` as Deploy command.
