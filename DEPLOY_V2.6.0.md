# Deploy v2.6.0

1. Apply the patch at repository root.
2. Run `npm install`.
3. Run `npm run check` and confirm 72/72 tests pass.
4. Run `npm run deploy:dry-run`.
5. Commit and push to `main`.
6. Wait for the existing Cloudflare deployment.
7. Confirm `service-worker.js` contains `trail-runner-coach-v2.6.0`.
8. Close and reopen the installed PWA, then refresh once.

Do not run any provider setup or Worker deployment command for this release.
