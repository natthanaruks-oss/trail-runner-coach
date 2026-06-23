# Trail Runner Coach iOS Companion

This SwiftUI companion loads the deployed Trail Runner Coach web app in a persistent `WKWebView` and exposes a narrow HealthKit bridge. Health data is normalized on-device and passed to the web app, which stores it in IndexedDB.

## Requirements

- macOS with a current Xcode release
- iOS 17 or newer
- a physical iPhone for HealthKit testing
- XcodeGen (`brew install xcodegen`)
- an Apple Development Team

## Build

```bash
cd ios/TrailRunnerCoach
xcodegen generate
open TrailRunnerCoach.xcodeproj
```

Before running, replace `com.yourcompany.trailrunnercoach` in `project.yml` with a unique bundle identifier and select your signing team in Xcode.

## Bridge

- WKScriptMessageHandler: `trailRunnerHealthKit`
- JavaScript receiver: `window.TrailRunnerCoachHealth`
- Actions: `authorize`, `sync`

The app accepts only an HTTPS web-app URL. HealthKit permissions are requested only when the user starts a sync from the web app.
