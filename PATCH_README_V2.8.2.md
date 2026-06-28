# v2.8.2 patch

This sync-safe patch adds multi-session plan reconciliation.

It must be applied after v2.8.1 and does not alter:

- Wearable Sync Worker
- Apple Health Worker
- Bridge token or encryption key
- Cloudflare KV
- IndexedDB schema

The patch supports combining up to four compatible same-day activities into one planned session while preserving separate continuous-endurance and total-volume interpretations.
