# Wearable Sync Worker

OAuth and webhook boundary for Strava, with provider boundaries reserved for Garmin and Suunto. Apple Health remains a native HealthKit integration and does not use this Worker.

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
3. Configure required secrets:

```bash
npx wrangler secret put TOKEN_ENCRYPTION_KEY
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
GET  /health
GET  /setup/status
GET  /oauth/strava/start
GET  /oauth/strava/callback
GET  /api/connections
POST /api/sync/strava
DELETE /api/connections/strava
GET  /webhooks/strava
POST /webhooks/strava
```

## Security model

- Client secrets and refresh tokens never enter `public/`.
- OAuth tokens are encrypted with AES-GCM before Cloudflare KV storage.
- The browser owns a random 256-bit device token; the Worker uses its SHA-256 hash.
- `/setup/status` exposes readiness booleans only, never credential values.
- The current device-token design is suitable for a personal prototype. Add authenticated user accounts before a public multi-user launch.
