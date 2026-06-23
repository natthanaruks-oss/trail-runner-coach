# Architecture

## Runtime

The primary application is a static ES-module PWA hosted on Cloudflare and executed entirely in the browser. IndexedDB is the system of record for local user data.

```text
Manual entry / file import / Apple Health / future providers
                         ↓
                    Adapters
                         ↓
             Normalized local records
                         ↓
 IndexedDB → Strain / Recovery / Readiness / Pain gates
                         ↓
         Adaptive recommendation and UI views
```

## Domain boundaries

- `AthleteProfile`: stable physiology and preferences.
- `RaceProfile`: an event target; no training sessions inside it.
- `TrainingPlan`: weeks and sessions linked to a race.
- `Activity`: completed behavior independent of any plan.
- `WorkoutResult`: planned-session completion record.
- `DailyCheckin`: wearable and subjective recovery inputs.
- `PainLog`: symptom history and safety signals.
- `BodyComposition`: dated measurements from InBody, Apple Health or manual sources.

The separation allows an athlete to switch races without losing readiness, activity or pain history.

## Native boundary

`ios/TrailRunnerCoach` is an optional SwiftUI companion:

```text
HealthKit → Swift service → normalized JSON → WKWebView JS bridge → IndexedDB
```

No health payload needs to be sent to a project server. Garmin/Suunto integrations differ because OAuth secrets and webhooks require an optional Cloudflare Worker boundary.
