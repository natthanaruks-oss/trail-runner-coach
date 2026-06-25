# Wearable roadmap

## Implemented through 1.7.0

- Persistent provider status, last-sync visibility and retry queue
- Automatic checks on app open, online recovery, visibility and focus
- Cross-provider activity deduplication and review workflow

- Provider-neutral normalized health/activity records.
- Apple Health JavaScript adapter and SwiftUI/HealthKit companion source.
- Connections UI for Apple Health, Garmin, Suunto and Strava.
- Optional encrypted Cloudflare Worker OAuth boundary.
- Strava OAuth, token refresh, webhook endpoint and recent activity normalization.
- Garmin/Suunto secure connection boundary pending approved API access.
- GPX, TCX, CSV and JSON activity import.
- Data-confidence handling when subjective safety inputs are missing.
- Guided Strava setup with one-command Worker/KV/secret deployment.
- Cross-provider canonical activity records with exact-ID updates, confidence scoring, review queue and historical reconciliation.

## Next delivery order

1. Test Apple Health companion on a physical iPhone and implement anchored incremental sync.
2. Add connection health, automatic last-sync status, retry queue and provider-specific diagnostics.
3. Calibrate Strain/Recovery scoring from real athlete data and baseline maturity.
4. Add a multi-week progress dashboard for distance, vertical, strain, recovery, pain and energy balance.
5. Add optional encrypted cross-device backup only with explicit consent.
6. Apply to Garmin/Suunto programs and enable direct adapters after approval.

## Guardrails

- Provider recovery/body-battery scores remain source metadata; they are not treated as interchangeable with Trail Runner Coach Recovery.
- Pain and subjective readiness remain required safety inputs.
- No client secret or refresh token may be embedded in the public web bundle.
- Multi-user deployment requires real account authentication and per-user authorization isolation.
