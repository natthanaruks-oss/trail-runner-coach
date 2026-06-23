# Wearable roadmap

## Implemented

- Provider-neutral normalized records.
- Apple Health JavaScript adapter.
- SwiftUI/HealthKit companion source.
- GPX, TCX, CSV and JSON activity import.
- Data-confidence handling when subjective safety inputs are missing.

## Next providers

### Garmin

Use an optional Cloudflare Worker for OAuth callback, encrypted token storage and webhook/API normalization. Never place client secrets in browser JavaScript.

### Suunto

Use the same Worker boundary and normalized schema. Provider-specific recovery scores should be retained as raw metadata but not treated as interchangeable with the application's readiness score.

## Future Apple work

- Background delivery and incremental anchors.
- Route/elevation enrichment where HealthKit data permits.
- App Store privacy disclosures and production signing.
- Optional encrypted cross-device sync with explicit user consent.
