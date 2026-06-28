# Deploy v2.5.1

1. Copy patch files over the current v2.5.0 repository.
2. Run `npm install`.
3. Run `npm run check` and confirm 66 tests pass.
4. Run `npm run deploy:dry-run`.
5. Commit and push to `main`.
6. Wait for Cloudflare deployment.
7. Reopen the app and tap Apple Health → Pull latest data.

No setup commands are required.
