# Sync Guard Report v2.6.0

This release changes only the browser application, presentation logic and provider-neutral insight model.

Unchanged:

- `workers/wearable-sync/src/index.js`
- `workers/apple-health-shortcut/src/index.js`
- OAuth routes and tokens
- Apple Health Bridge Token and encryption key
- Cloudflare KV bindings and stored data
- IndexedDB schema version 4
- Activity deduplication and provider import adapters

Provider metadata remains in storage for traceability but is not shown on the main Today experience.
