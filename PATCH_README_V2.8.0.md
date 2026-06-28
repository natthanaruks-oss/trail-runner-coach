# v2.8.0 Phase 3 — Revised Trail Coach Intelligence Patch

Apply this patch only after v2.7.0 Personal Trends and the v2.7.0 Health Insights dependency repair pass `npm run check`.

## Adds

- Provider-neutral Trail Coach detail page
- Daily prescription with pain safety override
- Elevation-aware load
- Long-run readiness
- Six-week distance, vertical and load progression
- Phase-aware race readiness and visible contributors
- Confidence and stale-data controls

## Preserves

- `metricDates` and `hasMixedMetricDates` repaired in v2.7.0
- IndexedDB version 4
- Apple Health and Strava Workers
- Bridge token, encryption key and KV bindings
