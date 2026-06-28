# Deploy v2.5.2

1. Copy this patch into the repository root.
2. Run `npm install`.
3. Run `npm run check`.
4. Run `npm run deploy:dry-run`.
5. Commit and push the web application changes.
6. Deploy the Apple Health Worker with `npm run deploy:apple-health-worker`.
7. Do not run the Apple Health setup command and do not regenerate secrets.
8. Pull Apple Health data again in the app.
