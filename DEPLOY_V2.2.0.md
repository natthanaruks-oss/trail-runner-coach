# Deploy Trail Runner Coach 2.2.0

## Safe deployment path

This release changes only the main web application assets. It does not redeploy the wearable-sync Worker.

1. Back up the current GitHub repository or create a release/tag for the working version.
2. Upload the contents of this folder to the same GitHub repository, replacing matching files.
3. Commit to the branch connected to Cloudflare.
4. Wait for the existing Cloudflare deployment to complete.
5. Open the app URL and refresh once. The PWA cache version is `trail-runner-coach-v2.2.0`.
6. Verify Today, More, Devices & Connections and one Strava Sync.

## Do not run again

Do not run these commands for this UI release:

- `npm run setup:strava`
- `npm run setup:google-health`
- any wearable-sync Worker deploy command

The existing Worker, KV bindings, secrets and stored tokens should remain unchanged.

## Post-deploy checks

- Main navigation shows Today / Plan / Train / Food / More.
- Form fields do not auto-zoom on mobile.
- More opens grouped menus.
- Devices & Connections shows the existing provider status.
- Advanced Settings still opens the original setup wizard.
- Strava Sync completes and existing activities are not duplicated.
