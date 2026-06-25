# Data schema

IndexedDB database: `trail_runner_coach`, version 4.

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


## Canonical Activity

```json
{
  "id": "activity-apple-1",
  "date": "2026-06-24",
  "startTime": "2026-06-24T10:00:00Z",
  "name": "Morning Trail Run",
  "type": "TrailRun",
  "durationMin": 92,
  "distanceKm": 12.1,
  "elevationGainM": 620,
  "avgHr": 147,
  "source": "hybrid",
  "primarySource": "apple_health",
  "sources": ["apple_health", "strava"],
  "externalRefs": [
    { "source": "apple_health", "externalId": "apple-health:workout-1" },
    { "source": "strava", "externalId": "strava:99" }
  ],
  "canonicalFingerprint": "2026-06-24|2026-06-24T10:00:00.000Z|run|92|12.1",
  "dedup": {
    "schemaVersion": 1,
    "status": "canonical",
    "lastMatchScore": 96,
    "mergedRecordIds": ["activity-strava-99"]
  }
}
```

`source = hybrid` means multiple provider records have been merged. `sources` and `externalRefs` preserve traceability and allow subsequent provider syncs to update the same canonical activity instead of creating another record. An uncertain record uses `dedup.status = review` until the user confirms Merge or Keep separate.

## Backup

A current backup includes app/version metadata and every store. Import is additive by default. Personal backups must not be committed to source control.
