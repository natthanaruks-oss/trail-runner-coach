# Wearable Sync Worker

Optional OAuth/webhook boundary for Garmin, Suunto and Strava. Apple Health remains a native HealthKit bridge and does not use this Worker.

## Security model

- Provider client secrets and refresh tokens never enter `public/`.
- OAuth tokens are encrypted with AES-GCM before storage in Cloudflare KV.
- The browser owns a random 256-bit device token. The Worker stores only its SHA-256 hash.
- This is suitable for a personal/single-user prototype. Add a real account/login layer before a multi-user public launch.

## Setup

1. Create three KV namespaces and copy `wrangler.example.jsonc` to `wrangler.jsonc`.
2. Set secrets:

```bash
npx wrangler secret put TOKEN_ENCRYPTION_KEY
npx wrangler secret put STRAVA_CLIENT_ID
npx wrangler secret put STRAVA_CLIENT_SECRET
npx wrangler secret put STRAVA_VERIFY_TOKEN
npx wrangler secret put GARMIN_CLIENT_ID
npx wrangler secret put GARMIN_CLIENT_SECRET
npx wrangler secret put SUUNTO_CLIENT_ID
npx wrangler secret put SUUNTO_CLIENT_SECRET
```

3. Deploy the Worker and paste its URL into **บันทึก → เชื่อมต่อ** in the app.
4. Register callback URLs:

```text
https://YOUR-WORKER/oauth/strava/callback
https://YOUR-WORKER/oauth/garmin/callback
https://YOUR-WORKER/oauth/suunto/callback
```

5. Register webhook URLs:

```text
https://YOUR-WORKER/webhooks/strava
https://YOUR-WORKER/webhooks/garmin
https://YOUR-WORKER/webhooks/suunto
```

## Current adapter status

- Strava OAuth, token refresh and recent activity import are implemented.
- Garmin OAuth boundary is ready; activity/health endpoint mapping must use the documentation and scopes granted to the approved developer account.
- Suunto OAuth boundary is ready; workout/FIT endpoint mapping must use the partner account documentation.
