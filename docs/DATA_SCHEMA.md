# Data schema

IndexedDB database: `trail_runner_coach`, version 3.

## Stores

- `settings` — athlete profile, motivation, preferences and active IDs.
- `raceProfiles` — race/event targets.
- `trainingPlans` — dated plans linked by `raceId`.
- `checkins` — daily recovery, behavior and subjective data.
- `activities` — completed workouts and daily exercise sessions.
- `painLogs` — dated symptoms.
- `workouts` — actual result for a planned session.
- `rehabLogs` — completed rehab/prehab work.
- `gear` — checklist state.
- `bodyComposition` — dated body measurements.
- `metadata` — sync and migration markers.

## RaceProfile

```json
{
  "id": "race-example",
  "name": "Mountain Ultra 50K",
  "date": "2027-02-14",
  "distanceKm": 50,
  "elevationGainM": 2800,
  "elevationLossM": 2800,
  "cutoffMinutes": 720,
  "startTime": "05:00",
  "aidStations": 5,
  "technicalLevel": 4,
  "nightRunning": true
}
```

## TrainingPlan

```json
{
  "id": "plan-example",
  "raceId": "race-example",
  "startDate": "2026-09-28",
  "templateId": "trail-ultra-20w-v1",
  "goal": "finish-healthy-happy",
  "weeks": []
}
```

Planned session IDs include the plan ID, preventing collisions when multiple plans contain identical week/day labels.

## Backup

A current backup includes app/version metadata and every store. Import is additive by default. Personal backups must not be committed to source control.
