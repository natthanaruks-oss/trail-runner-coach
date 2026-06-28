# Trail Runner Coach v2.6.0 Patch

Apply this patch only on top of v2.5.3.

## What changes

- Unified Today dashboard
- Provider-neutral Health Snapshot
- Recovery / Training Load / Energy pillars
- Explainable Coach Insight
- Health & Recovery detail route with charts

## What does not change

- Workers
- Tokens and secrets
- Cloudflare KV
- Strava and Health Auto Export pipelines
- IndexedDB schema

## Installation

```bash
rm -rf /tmp/trc260
mkdir -p /tmp/trc260
unzip -o trail-runner-coach_v2.6.0_unified_dashboard_sync_safe_patch.zip -d /tmp/trc260
cp -a /tmp/trc260/trc260_patch/. .
npm install
npm run check
npm run deploy:dry-run
```

Expected version: `2.6.0`
Expected tests: `72 passed, 0 failed`
