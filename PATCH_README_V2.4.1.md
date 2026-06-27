# Trail Runner Coach v2.4.1 — Apple Health Auto Pull Fix

Apply this patch over v2.4.0.

What it fixes:
- Apple Health data stored by the iPhone Shortcut is automatically pulled from the Worker into the current browser.
- Today and Apple Health pages show a persistent sync status instead of only a short toast.
- Adds “Check Worker data” to confirm how many daily records exist on the Worker.
- Refreshes the service-worker cache to v2.4.1.

Deploy:

```bash
npm install
npm run check
npm run deploy:dry-run
git add .
git commit -m "Fix Apple Health auto pull and diagnostics"
git push
```

Do not run setup:strava, setup:apple-health-shortcut or setup:google-health.
