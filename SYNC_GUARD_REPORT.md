# Sync Guard Report — 2.2.0

The UI/UX release was prepared with a protected sync boundary.

## Unchanged runtime files

The following SHA-256 values match the uploaded v2.1.0 package exactly:

- `workers/wearable-sync/src/index.js` — `340570935b06a04ce94229ced95a0541f67728816bae3f95f9d57c24346cbf51`
- `public/js/adapters/provider-sync.js` — `1e040b721068fa3df39a23eb81a1e5b2575d88c5c4f264ab135b2514dfb8a15a`
- `public/js/adapters/sync-manager.js` — `77b591abec98376709ad2eb32f47c672b53d7bbee1f95bb7a383cf0150ac3f8c`
- `public/js/core/db.js` — `ec753a607ce25a50460683ade5a7f2ef04e4478d8f0fa23bb7d03bc0b0ce448e`
- `public/js/core/store.js` — `97146442bb53887efca964303fac5487d73f6f84ec60502cd34091ec847719bc`
- `public/js/views/connections.js` — `0d98a9406bcf53046b5012cb6444f4e2c3bcfccb299ccf76d4cf89f2529eb806`

## Intentional boundary changes

- `public/js/core/constants.js`: app version only, database remains version 4.
- `public/service-worker.js`: cache name only, to load the new UI.
- `public/_headers`: keeps the known wearable Worker domain in `connect-src`.

No OAuth route, KV binding, secret name, token record key, device token key, provider endpoint or IndexedDB schema was changed.
