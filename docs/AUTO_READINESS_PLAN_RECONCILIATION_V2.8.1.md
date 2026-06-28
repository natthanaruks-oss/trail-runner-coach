# Auto Readiness & Plan Reconciliation v2.8.1

## Purpose

Close the coaching loop from synced recovery and workout data to daily decisions and training-plan completion.

## Automatic readiness

- Uses the latest safe non-null Sleep, Resting HR, HRV, Steps, Active Energy, Exercise Minutes and daily distance.
- Uses date-aware freshness windows instead of copying old physiological values indefinitely.
- Keeps the pain/symptom gate and subjective fatigue, soreness and stress check-in.
- Shows a conservative automatic preview before the human check-in is completed.
- Allows an optional manual override without making manual entry the default workflow.
- A single Sync action refreshes connected providers, imports local data and reconciles recent workouts with the plan.

## Plan reconciliation

- Compares synced activities with planned sessions using date, activity type, duration, distance and elevation.
- Scores each candidate from 0–100.
- Auto-matches scores of 80 or higher.
- Sends scores from 60–79 to user review.
- Protects manual Completed, Partial, Exceeded, Modified and Skipped decisions.
- Stores Planned vs Actual distance, duration, elevation, heart rate and completion percentage.
- Avoids creating a second manual activity when a synced activity is already linked.

## Safety and governance

- Provider names are not exposed in the main readiness and plan UX.
- Source IDs remain stored for audit, deduplication and troubleshooting.
- Pain and illness safety signals remain above readiness and plan-completion logic.
- Missing recovery values are not invented.
- IndexedDB remains version 4.
- Wearable, Strava and Apple Health Workers are unchanged.
