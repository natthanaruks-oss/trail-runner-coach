# Deploy v2.5.0

1. Apply this patch to the repository.
2. Run `npm install`, `npm run check`, and `npm run deploy:dry-run`.
3. Commit and push the web app files.
4. Set a temporary `CLOUDFLARE_API_TOKEN` in Codespaces.
5. Run `npm run deploy:apple-health-worker` to update only the existing Apple Health Worker. Existing Bridge Token, Encryption Key, KV binding and encrypted records are preserved.
6. Remove the Cloudflare token from the Terminal after deployment.
7. Configure Health Auto Export using `docs/HEALTH_AUTO_EXPORT_REST_API.md`.

Do not rerun `setup:strava` or `setup:apple-health-shortcut`.
