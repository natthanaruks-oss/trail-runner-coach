# Sync guard report — v2.8.2

## Unchanged

- `workers/wearable-sync/src/index.js`
- `workers/apple-health-shortcut/src/index.js`
- OAuth and Bridge tokens
- Encryption keys
- KV namespaces and bindings
- Activity import and cross-provider deduplication ownership rules
- IndexedDB version 4

## Changed

- Frontend plan reconciliation can aggregate multiple already-deduplicated activities.
- Aggregation happens after provider deduplication and never creates a new source activity.
- Every linked activity ID is reserved so it cannot be assigned to another plan record.
