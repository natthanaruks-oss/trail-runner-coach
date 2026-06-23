# Optional Wearable Sync Worker

This folder is a future OAuth/webhook boundary for Garmin and Suunto. It is intentionally separate from the root Pages deployment.

Do not place provider client secrets in `public/` or commit them to Git. Store secrets with Cloudflare Wrangler, for example:

```bash
npx wrangler secret put GARMIN_CLIENT_SECRET
npx wrangler secret put SUUNTO_CLIENT_SECRET
```

Before implementation, confirm provider program access, callback URLs, token storage design, deletion flow, consent wording, and data retention policy.
