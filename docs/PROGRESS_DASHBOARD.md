# Progress Dashboard — Step 5

## Purpose

The Progress Dashboard combines training execution, physiological scores, pain and fueling into one decision-support view. It is designed to answer:

- Is training volume moving in the intended direction?
- Is actual distance/vertical aligned with the active plan?
- Is recovery supporting the current load?
- Is pain improving, stable or worsening?
- Is food logging complete enough to interpret calorie balance?

It does not diagnose injury and does not treat perfect plan completion as the goal. Pain Safety Gates and sustainable consistency remain more important than adherence percentage.

## Filters

- 7 days: daily buckets
- 28 days: weekly buckets
- 90 days: weekly buckets
- Custom: 1–366 days; daily buckets up to 14 days, weekly buckets afterward

Every selected period is compared with the immediately preceding period of equal length.

## Metric rules

### Activity volume

Distance and vertical include run, trail run, walk and hike activities. Cycling, swimming, rowing and strength distance are excluded. Total training duration still includes all recorded activities.

Activities are read after the cross-provider deduplication pipeline, preventing an Apple Health/Strava/Garmin copy of the same workout from inflating totals.

### Plan adherence

Trainable sessions exclude Rest and Rehab. `completed` and `modified` count as completed; `skipped` remains visible; unlogged sessions are not assumed complete.

Actual distance and vertical come from canonical activities, while planned values come from the active Training Plan.

### Scores

- Strain remains a 0–21 score in summaries.
- For the trend chart only, Strain is normalized to 0–100 so it can share an axis with Recovery and Readiness.
- Recovery and Readiness averages exclude missing days.

### Pain

The dashboard shows maximum severity, pain days, hard-stop entries and the dominant area. The trend delta compares average severity in the second half of the period with the first half.

Pain ≥6/10 or pain while walking remains a safety signal regardless of good Recovery or adherence.

### Energy balance

Only days marked `foodComplete=true` contribute to net calorie balance. Incomplete days remain visible in coverage but do not create a false deficit.

## Explainable insights

Insights are deterministic and traceable. They may flag:

- adherence on track / low
- distance change versus the previous period
- good / mixed / low recovery
- high or worsening pain
- high calorie deficit or manageable energy balance
- insufficient data coverage

Insights support decisions; they do not prescribe medical treatment.

## Data coverage

The confidence indicator combines:

- Recovery/Readiness days
- activity days
- complete food-log days

Low coverage results in a caution to continue logging before making large training-load changes.

## Compatibility

- No IndexedDB schema change; database remains version 4.
- Existing v1.x data and backups remain compatible.
- No new server-side storage or personal data is bundled in the deployment.
