# Trail Coach Intelligence v2.8

## Purpose

Trail Coach converts recovery, training load, recent endurance, elevation exposure, plan consistency and race context into one transparent daily training prescription.

The model is provider-neutral. Data sources remain available under Data & Sync for diagnostics, but the coaching UI is organised around athlete decisions rather than apps.

## Safety hierarchy

1. Pain, altered gait, swelling, illness and unusual dizziness override all performance scores.
2. Missing subjective check-in prevents an unqualified hard-session recommendation.
3. Missing or stale sleep, resting heart rate and HRV reduce confidence. Missing values are never imputed.
4. Recommendations are training guidance, not medical diagnosis, injury prediction or race-finish guarantees.

## Outputs

- Daily prescription with suggested session type, distance factor, vertical factor and intensity cap.
- Race readiness with visible components: weekly volume, vertical specificity, long-run endurance, consistency, recovery, load balance and terrain specificity.
- Long-run readiness using the last 28 days of recorded run and hike evidence.
- Elevation-aware 7-day load with climb density, mechanical load and trail-equivalent distance.
- Six-week progression for distance, elevation gain and load.
- Data confidence and explicit missing/stale-data warnings.

## Race-readiness interpretation

Race readiness is phase-aware and descriptive. Foundation-phase athletes are not expected to look race-ready months in advance. The score shows whether current preparation is appropriate for the current phase and exposes the main gaps to address next.

## Data model

No IndexedDB migration is required. v2.8 reads existing activities, check-ins, race profiles, plans and health metrics. `DB_VERSION` remains 4.
