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
