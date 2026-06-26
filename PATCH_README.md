# Trail Runner Coach v2.3.0 — Sync-safe Patch

Apply this patch over the current GitHub repository. It intentionally excludes the existing Strava Worker and Strava setup files, so current Strava OAuth, tokens and KV resources are not overwritten.

After applying:

```bash
npm install
npm run check
npm run setup:apple-health-shortcut
```

Then commit the generated Apple Health Worker config and the CSP update, but never commit `apple-health-shortcut-setup-result.local.json`.

Read `DEPLOY_V2.3.0.md` and `docs/APPLE_HEALTH_SHORTCUTS_BRIDGE.md`.
