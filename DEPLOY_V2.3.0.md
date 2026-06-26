# Deploy v2.3.0 — Apple Health Shortcuts Bridge

## Protected components

The following existing Strava integration components are not changed by this feature:

- `workers/wearable-sync/src/index.js`
- Strava Worker name and URL
- OAuth routes and callback URL
- Strava secrets
- Existing Strava KV namespaces and tokens
- Browser device token
- Activity dedup keys
- IndexedDB name and version

## Deploy sequence

1. Upload/merge this source into the existing repository.
2. Run `npm install` and `npm run check`.
3. Push the web app changes and wait for Cloudflare app deployment.
4. Run `npm run setup:apple-health-shortcut` in Codespaces.
5. Commit the generated `workers/apple-health-shortcut/wrangler.jsonc` and the CSP update, but never commit the `.local.json` setup result.
6. Push again and wait for the web app CSP deployment.
7. Import the setup result in the Apple Health Shortcut page.
8. Build and run the iPhone Shortcut.
9. Pull the latest data in the app.
10. Regression-test Strava connection and one Strava activity sync.
