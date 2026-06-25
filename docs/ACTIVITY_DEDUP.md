# Cross-provider Activity Deduplication

## Objective

A single run may travel through several systems:

```text
Garmin / Apple Watch
        ↓
Garmin Connect / Apple Health
        ↓
Strava
        ↓
Trail Runner Coach
```

Without deduplication, one workout can be counted two or three times in Strain, load trends and recovery context. Version 1.6.0 creates one canonical activity while retaining traceability to every provider record.

## Match sequence

1. **Exact provider reference** — Same provider and `externalId` updates the existing activity.
2. **Cross-provider comparison** — Eligible sources are compared using:
   - start-time proximity;
   - duration similarity;
   - distance similarity;
   - compatible activity type;
   - average-heart-rate similarity when available.
3. **Decision**
   - High confidence: merge automatically.
   - Medium confidence: keep both and add the new record to the review queue.
   - Low confidence: keep both as independent activities.

Manual and plan-created activities are not automatically merged with wearable data because they often lack a reliable start timestamp.

## Canonical record

A merged record keeps:

```json
{
  "source": "hybrid",
  "primarySource": "apple_health",
  "sources": ["apple_health", "strava"],
  "externalRefs": [
    { "source": "apple_health", "externalId": "apple-health:..." },
    { "source": "strava", "externalId": "strava:..." }
  ],
  "canonicalFingerprint": "date|rounded-start|type|duration|distance",
  "dedup": {
    "status": "canonical",
    "lastMatchScore": 96,
    "lastMatchReasons": ["start_within_3m", "duration_very_close"]
  }
}
```

This preserves evidence and lets future provider syncs update the same activity.

## Field priorities

The merge is field-aware rather than provider-wide:

- Distance: Garmin/Suunto/GPX/TCX/Strava preferred when available.
- Elevation gain/loss: GPX/TCX/Garmin/Suunto preferred.
- Heart rate: Garmin/Apple Health/Suunto/Strava preferred.
- Active energy: Apple Health/Garmin/Suunto preferred.
- RPE: manual value or Strava perceived exertion preferred.
- Trail and night flags are retained if either source supplies them.

Zero or missing values never overwrite a useful value from another source.

## Review workflow

Open:

```text
Log → Data & Wearables → Activity Integrity
```

For an uncertain pair:

- **Merge** combines both records into the proposed canonical activity.
- **Keep separate** marks the decision and prevents repeated review prompts.

## Historical migration

At the first v1.6.0 startup, existing activities are normalized and reconciled once. The marker is stored in metadata as `activity_dedup_v1`. Users can run the scan again manually without changing the IndexedDB schema.

## Safety boundaries

- The engine intentionally favors false negatives over false positives.
- Two workouts far apart in time are never merged solely because their distance is similar.
- Records without both start times require a much higher score and normally remain separate.
- User-confirmed decisions override automatic suggestions.
