# Wearable Integration Guide

Trail Runner Coach uses a provider-neutral normalized schema. Each provider adapter converts its payload into the same daily health and activity records before Strain, Recovery and Readiness are calculated.

## Architecture

```text
Apple Health native companion ─┐
Garmin OAuth/API ───────────────┤
Suunto OAuth/API/FIT ───────────┼─> normalized records -> IndexedDB -> scoring engines
Strava OAuth/API/webhooks ──────┤
GPX/TCX/CSV/manual ─────────────┘
```

## Apple Health — primary source

Apple Health requires the native iOS companion under `ios/TrailRunnerCoach`; a normal website/PWA cannot access HealthKit directly.

Implementation path:

1. Generate/open the Xcode project.
2. Set a unique Bundle ID and Apple Development Team.
3. Enable HealthKit capability and required privacy descriptions.
4. Request read permission only for the types used by the app.
5. Test on a physical iPhone.
6. Use observer/anchored queries and background delivery for incremental updates after the initial sync.

The web app continues to work without the companion and accepts manual/imported fallback data.

## Cloud providers

Cloud provider client secrets must remain in the optional Cloudflare Worker under `workers/wearable-sync`. Never put them in `public/` or browser local storage.

### Worker security model

- Browser creates a random 256-bit device token.
- Worker stores only its SHA-256 hash.
- OAuth state expires after 10 minutes.
- Provider tokens are encrypted with AES-GCM before KV storage.
- Callback and return URL are restricted to the configured app origin.
- This is suitable for a personal prototype; add full user authentication before multi-user public use.

## Strava

Implemented in Worker:

- OAuth start/callback
- access/refresh token storage and refresh
- webhook verification/acknowledgement
- recent activity retrieval
- conversion into Trail Runner Coach activity records

Recommended setup:

1. Open **บันทึก → เชื่อมต่อ → Strava Setup Wizard**.
2. Register a Strava API application and use the callback domain shown by the wizard.
3. Run `npm run setup:strava` from the project root.
4. Import the generated `strava-setup-result.json` into the wizard.
5. Run the readiness check and select **Connect Strava** when all checks are green.

The command automates KV creation, required secrets and Worker deployment. Manual setup remains documented under `workers/wearable-sync/README.md`.

## Garmin

Garmin Health and Activity access requires approval through the Garmin Connect Developer Program. The app has the browser UI, encrypted token boundary and sync contract ready, but endpoint mapping cannot be finalized until the account receives approved API access, scopes and current provider documentation.

After approval:

1. Replace placeholder authorize/token URLs and scopes in Worker configuration.
2. Implement Health summaries for sleep, RHR, HRV where granted, steps and stress.
3. Implement Activity detail ingestion.
4. Configure push/webhook delivery if included in the approved product.
5. Add provider fixture tests before enabling production sync.

## Suunto

Suunto API access requires acceptance to the partner program. The Worker boundary and normalized contract are ready. Once access is granted, implement workout summary and FIT retrieval based on the partner documentation.

After approval:

1. Confirm OAuth authorize/token URLs and scopes.
2. Implement workout list/summary mapping.
3. Download and parse FIT when detailed samples, altitude, HR/RR or GPS are required.
4. Configure provider callbacks/webhooks if enabled for the account.
5. Add fixture and duplicate-prevention tests.

## Data precedence and deduplication

Recommended precedence:

1. Apple Health for daily health metrics when the iPhone companion is authorized.
2. Source-native provider for detailed workout records.
3. Strava as activity fallback/secondary social source.
4. Manual or file import when a provider is unavailable.

Version 1.6.0 implements this policy: provider + external activity ID is checked first, then start time, duration, distance, activity type and average HR are scored across providers. High-confidence matches merge into one canonical activity; uncertain matches remain separate for user review. `sources[]` and `externalRefs[]` preserve traceability. See `ACTIVITY_DEDUP.md`.

## Operational status

| Provider | UI | OAuth boundary | Live data adapter | Additional requirement |
|---|---|---|---|---|
| Apple Health | Ready | Native HealthKit | Foundation ready | Xcode signing + iPhone test |
| Strava | Ready | Implemented | Recent activities implemented | API credentials + Worker deploy |
| Garmin | Ready | Implemented boundary | Pending | Developer Program approval |
| Suunto | Ready | Implemented boundary | Pending | Partner approval |


## v1.7 Sync lifecycle

Version 1.7.0 adds client-side auto-sync status and a persistent retry queue. Temporary network, rate-limit and server failures retry with backoff while authorization, disconnected-provider and pending-adapter errors require user action. Last successful data remains visible even after a later failed attempt. See `SYNC_LIFECYCLE.md`.
