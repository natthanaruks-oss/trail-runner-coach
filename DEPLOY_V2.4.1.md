# Deploy v2.4.1

Apply the sync-safe patch over v2.4.0, then run:

```bash
npm install
npm run check
npm run deploy:dry-run
git add .
git commit -m "Auto pull Apple Health data into the app"
git push
```

Do not run any setup script. Existing Strava and Apple Health Workers, KV bindings, Secrets and tokens remain unchanged.
