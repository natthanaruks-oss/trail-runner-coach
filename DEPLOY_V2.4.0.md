# Deploy Trail Runner Coach v2.4.0

## Scope

This release makes imported Apple Health data visible and actionable. It does not redeploy or reconfigure either sync Worker.

## Deploy

1. Back up or tag the current working repository.
2. Copy the v2.4.0 files over the existing repository.
3. Run:

```bash
npm install
npm run check
npm run deploy:dry-run
git add .
git commit -m "Show Apple Health insights and score impact"
git push
```

4. Wait for the existing Cloudflare deployment to finish.
5. Open the app and refresh once. The service-worker cache is bumped to `trail-runner-coach-v2.4.0`.

## Do not rerun setup

Do not run any of these for this UI release:

```bash
npm run setup:strava
npm run setup:google-health
npm run setup:apple-health-shortcut
```

The current Worker URLs, KV namespaces, Secrets, Bridge Token, OAuth state and provider tokens remain unchanged.

## Acceptance checks

- Today shows an Apple Health section.
- Steps from the current Shortcut payload appear after **Pull latest**.
- Steps contribute to Behavior Load and Daily Strain.
- When Sleep, RHR and HRV are later added to the Shortcut, they appear and contribute to Recovery.
- When Active Energy is added, the calorie target reports Apple Health as its source.
- Strava remains connected and existing activities are unchanged.
- Apple Health setup details are collapsed under Advanced Settings after configuration.
