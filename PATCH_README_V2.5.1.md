# Trail Runner Coach v2.5.1 — Apple Health Latest-Day Display Fix

This sync-safe patch fixes a display issue where Health Auto Export successfully stores completed-day metrics on the Worker, but the app shows blank cards because the dashboard only looked for a record matching today's date.

## Changes
- Falls back to the latest available Apple Health day when today's export is not available yet.
- Shows the actual data date in the Apple Health page and dashboard.
- Recognizes `health_auto_export` as an Apple Health transport.
- Labels Health Auto Export as the source.
- Bumps the app and service-worker cache version to 2.5.1.

## Not changed
- Strava Worker, OAuth, tokens, KV, and deduplication.
- Apple Health Worker, bridge token, encryption key, and KV.
- IndexedDB schema (remains version 4).

## Deploy
Copy this patch over v2.5.0, then run:

```bash
npm install
npm run check
npm run deploy:dry-run
git add .
git commit -m "Show latest Apple Health data when today is incomplete"
git pull --rebase origin main
git push origin main
```

Do not rerun Strava or Apple Health setup.
