# Strava Setup Wizard

## Goal

Reduce the first-time Strava integration from many manual Cloudflare commands to one guided command plus an in-app validation flow.

## User flow

1. Open **Log → Connections → Strava Setup Wizard**.
2. Create or open the Strava API application.
3. Copy the predicted **Authorization Callback Domain** shown by the app.
4. From the project root, run:

```bash
npm run setup:strava
```

5. Enter:
   - Trail Runner Coach Web App URL
   - Cloudflare Worker name
   - Strava Client ID
   - Strava Client Secret
6. The script:
   - verifies Node.js 22+
   - signs in to Cloudflare when required
   - generates `workers/wearable-sync/wrangler.jsonc`
   - creates and binds `OAUTH_STATE`, `WEARABLE_TOKENS`, and `WEARABLE_EVENTS`
   - generates the AES-GCM token-encryption key and webhook verification token
   - uploads required secrets during Worker deployment
   - deploys the Worker
   - writes `strava-setup-result.json`
7. Import `strava-setup-result.json` in the in-app wizard.
8. Run the in-app system check.
9. When all four checks are green, select **Connect Strava**.

## Security controls

- The Strava Client Secret is entered in the terminal and is not written to the repository.
- A temporary secrets file is created with restricted permissions, passed to Wrangler for deployment, and deleted in a `finally` block.
- `strava-setup-result.json` contains URLs and setup metadata only. It has no provider credentials or OAuth tokens.
- OAuth access and refresh tokens are encrypted with AES-GCM before storage in Cloudflare KV.
- The public `/setup/status` endpoint returns only boolean readiness indicators; it never returns secret values.
- Account-level login should be added before this integration is offered as a public multi-user service.

## Generated local files

These files are intentionally ignored by Git:

```text
workers/wearable-sync/wrangler.jsonc
strava-setup-result.json
```

## Worker status endpoint

```text
GET /setup/status
```

Response includes:

- App origin configured or missing
- KV bindings configured or missing
- Required Strava secrets configured or missing
- Overall ready status
- Callback and webhook URLs

It does not expose any secret or token value.

## Re-running setup

The command is safe to re-run when `wrangler.jsonc` already contains valid KV bindings. Existing bindings are reused and secrets are replaced during deployment. Keep a Cloudflare backup or version history before changing a production integration.
