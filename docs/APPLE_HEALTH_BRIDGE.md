# Apple Health bridge

Safari and installed PWAs cannot call HealthKit. Trail Runner Coach therefore uses an optional native iOS companion as the trusted HealthKit boundary.

```text
Trail Runner Coach iOS Companion
  HealthKit authorization and queries
                 ↓
 normalized payload on the iPhone
                 ↓
 window.TrailRunnerCoachHealth.receive(payload)
                 ↓
 Web app adapters and IndexedDB
```

## Bridge contract

JavaScript posts to the WKWebView message handler:

```text
trailRunnerHealthKit
```

Supported actions:

- `authorize`
- `sync` with a requested day range

The native app returns daily sleep, resting HR, HRV, steps, active energy, exercise minutes, workouts and available body metrics. The web app merges wearable fields with manual pain, fatigue, soreness and stress inputs instead of overwriting them.

## Security

- The companion accepts only an HTTPS web app URL.
- HealthKit permissions remain under iOS control.
- The current design stores normalized payloads only in the web app's local IndexedDB.
- Do not add broad remote navigation, arbitrary script injection or server upload without an explicit privacy design review.
