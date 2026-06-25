# Build Report — Trail Runner Coach 2.0.0

## Scope delivered: Step 6 of 6

**Encrypted Cloud Backup** was implemented without removing any existing feature.

Delivered:

- Browser-side PBKDF2-SHA-256 and AES-GCM-256 encryption.
- Encrypted snapshot checksum validation and gzip compression when supported.
- Cloudflare Worker with two KV bindings, hashed vault authorization, version retention and opaque encrypted storage.
- Recovery Kit export/import with no passphrase.
- Manual and automatic backup, version listing, Merge/Replace restore, deletion and device disconnect.
- Bilingual UI and setup command `npm run setup:backup`.
- Sensitive cloud credentials are excluded from normal local JSON exports.
- No IndexedDB schema change.

## Automated verification

- Repository verification: **passed** — 449 legacy foods + 1,375 prepared foods.
- Automated tests: **53/53 passed**.
- Cloud-backup crypto tests: passphrase encryption/decryption, remembered derived key and wrong-passphrase rejection passed.
- Cloud-backup Worker lifecycle test: create vault, upload, list, download and delete encrypted versions passed.
- Browser/IndexedDB integration and primary-route rendering passed.
- Main Cloudflare Worker dry-run: **passed — 72 public assets**.
- Cloud-backup Worker dry-run: **passed — 2 KV bindings**.
- Wearable-sync Worker dry-run: **passed — 3 KV bindings**.
- `npm audit --omit=dev`: **0 vulnerabilities**.
- Full `npm audit`: **0 vulnerabilities**.

## Runtime and deployment

- Node.js: 22+
- Wrangler: 4.103.0
- Main Cloudflare Worker: `trail-runner-coaches`
- Optional cloud-backup Worker: `trail-runner-coach-cloud-backup`
- Optional wearable-sync Worker: `trail-runner-coach-wearable-sync`
- App/PWA cache version: 2.0.0
- IndexedDB: `trail_runner_coach`, schema version 4

## Security boundary

- No passphrase, Recovery Kit, access token, OAuth secret, health export or InBody record is bundled in the deploy package.
- The Cloudflare Worker stores encrypted envelopes and cannot derive the encryption key from stored data.
- The access token is stored server-side only as a SHA-256 hash.
- Losing the passphrase makes existing backup versions unrecoverable.
- Remembering the encryption key is optional and stores derived key material only on the current device.

## Known operational limitation

Automatic backup runs while the web app/PWA is open, regains focus or returns online. A fully closed or suspended browser cannot run continuous background backup.
