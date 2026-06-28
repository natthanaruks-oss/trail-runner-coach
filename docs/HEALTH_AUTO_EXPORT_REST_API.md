# Health Auto Export REST API — Trail Runner Coach v2.5.0

## Recommended flow

Apple Health → Health Auto Export → Apple Health Worker → encrypted KV → Trail Runner Coach browser.

This replaces the long iPhone Shortcut as the primary method. The old Shortcut payload remains supported as a backup.

## Metrics to select

- Step Count
- Active Energy
- Apple Exercise Time
- Walking + Running Distance
- Sleep Analysis
- Resting Heart Rate
- Heart Rate Variability
- Weight & Body Mass
- Body Fat Percentage

Do not select Workouts while Strava is connected.

## REST API settings

- Automation type: REST API
- Method: POST (automatic)
- URL: `https://trail-runner-coach-apple-health-sync.natthanaruk-s.workers.dev/v1/import`
- Header key: `Authorization`
- Header value: `Bearer <Bridge Token>`
- Export format: JSON
- Export version: 2
- Data type: Health Metrics
- Summarize Data: ON
- Time Grouping: Day
- Date range for first test: Previous 7 Days
- Date range after successful test: Since Last Sync
- Batch Requests: OFF for the recommended 9 summarized metrics; turn ON only if payload-size errors occur
- Workouts: OFF

## First test

1. Keep iPhone unlocked.
2. Turn off Low Power Mode temporarily.
3. Run Manual Export for Previous 7 Days.
4. A successful endpoint response has `ok: true`, `transport: health_auto_export`, and at least one daily metric or body-composition record.
5. Open Trail Runner Coach → Apple Health → Check Worker data → Pull latest data.

## Reliability

Apple does not permit Health access while the iPhone is locked. Background App Refresh must be enabled, and iOS may delay background work. A 1–6 hour cadence is more realistic than minute-level syncing.
