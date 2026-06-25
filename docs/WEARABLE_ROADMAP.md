# Wearable roadmap

## Implemented through 2.1.0

- Provider-neutral normalized health/activity/body-composition records.
- Apple Health JavaScript adapter and SwiftUI/HealthKit companion source.
- Google Health / Fitbit OAuth, encrypted token handling, data-point retrieval and normalized import.
- Connections UI for Apple Health, Google Health/Fitbit, Garmin, Suunto and Strava.
- Optional encrypted Cloudflare Worker OAuth boundary.
- Strava OAuth, token refresh, webhook endpoint and recent activity normalization.
- Google Health setup wizard with one-command Worker/KV/secret deployment.
- Garmin/Suunto secure connection boundary pending approved API access.
- GPX, TCX, CSV and JSON activity import.
- Cross-provider canonical activity records with exact-ID updates, confidence scoring, review queue and historical reconciliation.
- Persistent provider status, last-sync visibility and retry queue.
- Automatic checks on app open, online recovery, visibility and focus.
- Data-confidence handling when subjective safety inputs are missing.
- Personalized Strain, Recovery and Readiness calibration.
- Progress Dashboard and encrypted cross-device backup.

## Next delivery order

1. Connect a real Google Health/Fitbit test account and validate every requested data type against live payloads.
2. Test Apple Health companion on a physical iPhone and implement anchored incremental sync.
3. Add source-priority controls so the athlete can choose the preferred daily-metric and workout provider.
4. Add Google Health webhook/subscription support after the live API account and event model are confirmed.
5. Apply to Garmin/Suunto programs and enable direct adapters after approval.
6. Add authenticated multi-user account isolation before any public launch.

## Guardrails

- Provider recovery/body-battery scores remain source metadata; they are not treated as interchangeable with Trail Runner Coach Recovery.
- Pain and subjective readiness remain required safety inputs.
- No client secret or refresh token may be embedded in the public web bundle.
- Google Health, Apple Health and Strava copies of the same workout must pass canonical deduplication before Strain calculation.
- Missing provider data is not interpreted as a true zero unless the provider explicitly supplies a true-zero record.
- Multi-user deployment requires real account authentication and per-user authorization isolation.
