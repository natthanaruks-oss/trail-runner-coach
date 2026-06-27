# Trail Runner Coach v2.4.0 — Sync-safe Patch

Copy this patch over an existing v2.3.0 repository.

This patch contains only application UI, insight, nutrition, version, test and documentation files. It does not contain either Worker implementation, provider sync adapters, OAuth setup scripts, KV configuration or secrets.

After copying:

```bash
npm install
npm run check
npm run deploy:dry-run
git add .
git commit -m "Show Apple Health insights and score impact"
git push
```

Do not rerun Strava or Apple Health setup for this release.
