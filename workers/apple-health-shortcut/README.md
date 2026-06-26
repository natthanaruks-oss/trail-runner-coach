# Apple Health Shortcuts Bridge Worker

Separate Cloudflare Worker for receiving daily Apple Health summaries from an iPhone Shortcut. It does not modify or share the Strava/Google wearable Worker.

Endpoints:
- `GET /setup/status`
- `POST /v1/import` with `Authorization: Bearer <bridge token>`
- `GET /v1/sync?days=90` with the same token
- `DELETE /v1/data` with the same token

The stored payload is encrypted with AES-GCM before being written to KV.
