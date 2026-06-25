# Legacy Feature Parity Checklist

Baseline: `roadtopyc70.zip` single-file application. Target: Trail Runner Coach modular architecture.

## Primary navigation

- [x] วันนี้ / Today
- [x] แผน / Plan
- [x] ฝึก / Train
- [x] อาหาร / Food
- [x] บันทึก / Log

## Food and energy

- [x] Food search and categories across 449 legacy + 1,375 Thai prepared foods
- [x] Recent foods
- [x] Portion multiplier
- [x] Custom food create/edit/delete
- [x] Bundled food edit/hide/reset through non-destructive overrides
- [x] Daily food entry edit/delete
- [x] Calories, protein, carbs and fat totals
- [x] Water tracker
- [x] Complete-day marker
- [x] Energy balance with complete-day protection
- [x] 7/14/30/90-day and custom date-range trend
- [x] Nutrition and race-fueling guides
- [x] HR zones

## Training support

- [x] Rehab library and daily completion
- [x] Strength library and daily completion
- [x] Running drills and daily completion
- [x] Home equipment tracking
- [x] Race gear checklist

## Logs and athlete context

- [x] Motivation / why I run
- [x] Pain/niggle CRUD and safety use in readiness
- [x] Weight/body-composition history
- [x] Manual sleep and resting HR fallback
- [x] Apple Health primary sync architecture
- [x] Garmin/Suunto/Strava connection center and secure Worker boundary
- [x] Backup/restore and legacy migration

## Release rule

A release cannot be labeled feature-parity unless the workflow is tested as: open → create → save → edit → delete/undo where applicable → reload → verify persistence.

## Interaction continuity

- [x] Same-route saves retain scroll position
- [x] Route navigation restores route-specific scroll
- [x] Routine writes do not re-read every IndexedDB store
- [x] No full-page refresh is required for CRUD actions


## Bilingual interface

- [x] Header language toggle (`EN / ไทย`)
- [x] Language selection in Settings
- [x] Persistent language preference
- [x] Thai/English primary navigation and all route headers
- [x] Thai/English forms, dialogs, status messages and warnings
- [x] Thai/English training, rehab, nutrition, gear and integration guidance
- [x] Language-aware food names, dates and numbers
- [x] User-entered notes remain unchanged


## v1.5.0 integration setup continuity

- [x] Strava Setup Wizard added without removing any existing menu
- [x] Existing Worker URL form remains available for advanced/provider setup
- [x] Existing Connect / Sync / Disconnect actions retained
- [x] Thai and English setup flows tested
- [x] No IndexedDB schema change
- [x] Food, calories, training, readiness, pain, body and backup workflows unchanged

## v1.6.0 activity integrity continuity

- [x] Apple Health, Strava, Garmin, Suunto and file imports use one deduplication pipeline
- [x] Exact provider updates do not create duplicate activities
- [x] High-confidence cross-provider copies merge into one canonical activity
- [x] Uncertain matches remain separate until user review
- [x] Source provenance and external references remain traceable
- [x] Historical activity records are reconciled without changing the IndexedDB schema
- [x] Strain reads canonical activities only after reconciliation
- [x] Food, calories, training, readiness, pain, body, bilingual and backup workflows remain unchanged

## v1.7.0 sync continuity

- All legacy food, nutrition, water, training, rehab, pain, body, sleep and backup workflows remain available.
- Auto Sync updates the Connections UI without replacing the full route DOM or resetting scroll position.
- Manual Sync remains available even when Auto Sync is disabled.
- Sync retries pass through activity deduplication, so provider failures and retries do not inflate Strain.
- Existing local data and backup files require no database migration.
## v1.9 Progress Dashboard regression controls

- Progress is added as a route and Log tab; the five primary bottom-navigation items remain unchanged.
- Food catalog, food CRUD, complete-day calorie filters, Training Plan, Rehab, Pain, Body, Sleep, Sync, Deduplication and Calibration remain available.
- Progress totals use canonical deduplicated activities and do not mutate source activities or workout logs.
- No IndexedDB schema change; existing backups remain compatible.
- English-mode integration tests verify that the new Progress route does not leave mixed Thai UI copy.

