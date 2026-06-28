# Wake-day recovery alignment — v2.8.3

## Business rule

Overnight recovery belongs to the day the athlete wakes up and is used for that full day.

Example:

- Health Auto Export source date: 2026-06-27
- Sleep period: night of 27 June into morning of 28 June
- Readiness date: 2026-06-28

The app therefore keeps two dates:

- `sourceDate`: date supplied by the provider
- `effectiveDate` / `readinessDate`: day the metric is used for readiness

## Metrics aligned to wake day

- Sleep duration
- Resting heart rate
- HRV

The one-day shift is applied only to Health Auto Export records because its daily summary is stored under the previous calendar date in this integration. Direct same-day HealthKit or manual values remain on their recorded date.

## Metrics that stay on calendar day

- Steps
- Active energy
- Exercise minutes
- Walking and running distance

These values never roll forward from yesterday into today.

## Readiness behavior

- The Today screen can calculate a conservative automatic readiness preview without requiring a saved manual check-in.
- Subjective fatigue, stress, soreness and pain remain user inputs.
- Pain and illness safety gates still override performance scores.
- Overnight recovery remains attached to today after morning or evening workouts are synced.

## Traceability

No database schema migration is required. Existing records can store:

- `autoMetricDates`
- `autoMetricEffectiveDates`
- `autoMetricAlignments`
- `autoReadiness.recoveryDatePolicy = wake_day_v1`

Provider metadata remains available in Data & Sync diagnostics and is not exposed as the primary dashboard grouping.
