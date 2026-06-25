# Wearable Sync Worker

OAuth, token-refresh and API boundary for Google Health/Fitbit plus OAuth/API/webhook support for Strava, with provider boundaries reserved for Garmin and Suunto. Apple Health remains a native HealthKit integration and does not use this Worker.

## Recommended Google Health / Fitbit setup

From the repository root:

```bash
npm run setup:google-health
```

The setup wizard reuses or creates the three KV namespaces, writes the local Worker config, uploads required Google OAuth secrets, deploys the Worker, and creates `google-health-setup-result.json` for import into the web app.

Full instructions: `docs/GOOGLE_HEALTH_FITBIT.md`.

## Recommended Strava setup

From the repository root:

```bash
npm run setup:strava
```

The setup wizard creates the three KV namespaces, writes the local Worker config, uploads required secrets, deploys the Worker, and creates `strava-setup-result.json` for import into the web app.

Full instructions: `docs/STRAVA_SETUP_WIZARD.md`.

## Manual setup fallback

1. Copy `wrangler.example.jsonc` to `wrangler.jsonc`.
2. Create and bind:
   - `OAUTH_STATE`
   - `WEARABLE_TOKENS`
   - `WEARABLE_EVENTS`
3. Configure the shared encryption secret plus the provider secrets you use:

```bash
npx wrangler secret put TOKEN_ENCRYPTION_KEY

# Google Health / Fitbit
npx wrangler secret put GOOGLE_HEALTH_CLIENT_ID
npx wrangler secret put GOOGLE_HEALTH_CLIENT_SECRET

# Strava
npx wrangler secret put STRAVA_CLIENT_ID
npx wrangler secret put STRAVA_CLIENT_SECRET
npx wrangler secret put STRAVA_VERIFY_TOKEN
```

4. Deploy:

```bash
npx wrangler deploy --config workers/wearable-sync/wrangler.jsonc
```

## Endpoints

```text
GET    /health
GET    /setup/status
GET    /oauth/google_health/start
GET    /oauth/google_health/callback
GET    /oauth/strava/start
GET    /oauth/strava/callback
GET    /api/connections
POST   /api/sync/google_health
POST   /api/sync/strava
DELETE /api/connections/google_health
DELETE /api/connections/strava
GET    /webhooks/strava
POST   /webhooks/strava
```

## Security model

- Client secrets and refresh tokens never enter `public/`.
- OAuth tokens are encrypted with AES-GCM before Cloudflare KV storage.
- The browser owns a random high-entropy device token; the Worker uses its SHA-256 hash.
- OAuth state is short-lived and bound to the requesting device hash.
- Callback return URLs are restricted to `APP_ORIGIN`.
- `/setup/status` exposes readiness booleans only, never credential values.
- The current device-token design is suitable for a personal prototype. Add authenticated user accounts before a public multi-user launch.
