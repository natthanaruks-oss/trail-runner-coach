# AI Coach Browser Connection Repair v1

## Evidence before repair

- AI Worker health endpoint returns HTTP 200.
- CORS preflight for the configured production origin returns HTTP 204.
- A real authenticated POST with the setup receipt returns HTTP 200.
- The browser still reports Safari's generic `Load failed`.

This isolates the remaining failure to the browser/PWA request path rather than
the Worker credential, Workers AI binding or model.

## Changes

1. Increases the AI request deadline from 25 seconds to 75 seconds.
2. Uses explicit CORS mode, no credentials and no-store cache.
3. Runs a short `/health` diagnosis after a network-level failure.
4. Replaces Safari's generic `Load failed` with a useful message.
5. Reflects the requesting browser origin for CORS preflight and responses.
6. Keeps Bearer authentication mandatory for every AI POST.
7. Keeps the deterministic Local Coach and all safety validation unchanged.

## Security note

Broad browser-origin compatibility does not remove authentication. The Worker
still rejects every POST whose `AI_COACH_ACCESS_TOKEN` does not match.
