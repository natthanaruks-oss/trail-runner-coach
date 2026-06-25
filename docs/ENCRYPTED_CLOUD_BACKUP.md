# Encrypted Cloud Backup

## Security model

Trail Runner Coach encrypts the complete IndexedDB snapshot in the browser before upload.

- Key derivation: PBKDF2-SHA-256 with a vault-specific salt and 310,000 iterations.
- Encryption: AES-GCM-256 with a new 96-bit IV for every version.
- Integrity: AES-GCM authentication plus a SHA-256 digest of the plaintext snapshot.
- Compression: gzip when the browser supports `CompressionStream`; otherwise the encrypted payload stores uncompressed JSON.
- Server knowledge: the Worker receives only encrypted envelopes, minimal version metadata, and a SHA-256 hash of a random access token.
- The passphrase is never sent to Cloudflare, written to the repository, or included in the Recovery Kit.

This is a zero-knowledge design with an important limitation: there is no password reset. Losing the passphrase makes existing cloud versions undecryptable.

## Cloudflare components

The optional Worker is in `workers/cloud-backup` and uses two KV namespaces:

- `BACKUP_VAULTS`: vault metadata and hashed access token.
- `BACKUP_BLOBS`: versioned encrypted backup envelopes.

The default retention is 10 versions and can be configured from 3 to 30. The Worker prunes the oldest versions after upload. Each encrypted request is limited to 12 MiB.

## Setup

From the repository root on Node.js 22+:

```bash
npm run setup:backup
```

The script:

1. Signs in to Cloudflare with Wrangler.
2. Creates and binds the two KV namespaces.
3. Deploys `trail-runner-coach-cloud-backup`.
4. Writes `cloud-backup-setup-result.json` without secrets.

In the app, open:

```text
Log → Data & Wearables → Encrypted Cloud Backup
```

Import the setup result, create a passphrase of at least 12 characters, create the vault, and store the downloaded Recovery Kit separately from the device.

## Recovery Kit

The Recovery Kit contains:

- Worker URL
- Vault ID
- High-entropy access token
- PBKDF2 parameters

It does not contain the passphrase or plaintext health data. Treat it as sensitive because it allows access to encrypted blobs and deletion operations.

## Automatic backup

Automatic backup is optional and requires selecting “Remember encryption key on this device.” The stored value is derived key material, not the passphrase. It remains in local IndexedDB. Automatic backup runs when the app is open, regains focus, or comes back online and the configured interval is due. A closed browser or suspended PWA cannot run continuously in the background.

## Restore modes

- **Merge**: imports records into the current local database and then reruns activity deduplication.
- **Replace**: clears every known store before importing the selected snapshot.

The app downloads and decrypts the version locally, validates the checksum, and displays record counts before applying either mode.

## Operational controls

- Download the Recovery Kit again while connected.
- Forget the local encryption key to require a passphrase for each operation.
- Disconnect only the current device without deleting cloud versions.
- Permanently delete the remote vault and all versions with two confirmations.
