# Trail Runner Coach Cloud Backup Worker

This Worker stores only encrypted backup envelopes. Encryption and decryption happen in the browser with AES-GCM. The Worker stores a SHA-256 hash of the high-entropy access token, vault metadata, and versioned encrypted blobs.

Run from the repository root:

```bash
npm run setup:backup
```

The setup script creates the required KV namespaces, writes a local `wrangler.jsonc`, deploys the Worker, and creates `cloud-backup-setup-result.json` for import into the app.
