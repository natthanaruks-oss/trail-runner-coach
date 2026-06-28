# Trail Runner Coach v2.5.0 — Health Auto Export REST API Patch

Apply this patch on top of the current repository. It intentionally does not contain `workers/wearable-sync/src/index.js`, so the working Strava OAuth and token flow are not overwritten.

## Install

```bash
unzip -o trail-runner-coach_v2.5.0_health_auto_export_sync_safe_patch.zip -d /tmp/trc250
cp -a /tmp/trc250/trc250_patch/. .
npm install
npm run check
npm run deploy:dry-run
git add .
git commit -m "Add Health Auto Export REST API sync"
git pull --rebase origin main
git push origin main
```

## Update only the existing Apple Health Worker

Set a temporary `CLOUDFLARE_API_TOKEN`, then run:

```bash
npm run deploy:apple-health-worker
```

This command discovers the existing Apple Health KV namespace, creates a local Wrangler config, and deploys only the updated Apple Health parser. It does not rotate or replace the Bridge Token, Encryption Key, or KV data.

Do not run `setup:strava` or `setup:apple-health-shortcut`.
