# Wearable roadmap

## Implemented in 1.3.0

- Provider-neutral normalized health/activity records.
- Apple Health JavaScript adapter and SwiftUI/HealthKit companion source.
- Connections UI for Apple Health, Garmin, Suunto and Strava.
- Optional encrypted Cloudflare Worker OAuth boundary.
- Strava OAuth, token refresh, webhook endpoint and recent activity normalization.
- Garmin/Suunto secure connection boundary pending approved API access.
- GPX, TCX, CSV and JSON activity import.
- Data-confidence handling when subjective safety inputs are missing.

## Next delivery order

1. Test Apple Health companion on a physical iPhone and implement anchored incremental sync.
2. Deploy Strava Worker with personal API credentials and validate duplicate handling.
3. Apply to Garmin Connect Developer Program; implement Health and Activity adapters after approval.
4. Apply to Suunto Partner Program; implement workout summary/FIT adapter after approval.
5. Add connection health, last-sync timestamp, retry queue and provider-specific diagnostics.
6. Add optional encrypted cross-device sync only with explicit consent.

## Guardrails

- Provider recovery/body-battery scores remain source metadata; they are not treated as interchangeable with Trail Runner Coach Recovery.
- Pain and subjective readiness remain required safety inputs.
- No client secret or refresh token may be embedded in the public web bundle.
- Multi-user deployment requires real account authentication and per-user authorization isolation.
