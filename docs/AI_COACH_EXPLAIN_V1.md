# AI Coach Explain v3

## Purpose

AI Coach Explain v1 adds a controlled explanation layer on top of the existing
deterministic Trail Coach.

The Local Coach remains the source of truth.

## Safety architecture

1. The browser builds a summarized snapshot.
2. Raw health rows, name, email and API keys are excluded.
3. A separate Cloudflare Worker authenticates the app with a bearer token.
4. The Worker calls the OpenAI Responses API with `store: false`.
5. Structured output must echo:
   - action code
   - red/yellow/green status
   - hard-stop safety lock
6. The Worker and browser both reject any mismatch.
7. AI returns text only. It cannot modify the plan or write to IndexedDB.

## Data sent

- date and language
- planned session summary
- deterministic prescription
- readiness/recovery/load/energy scores
- race countdown summary
- long-run evidence summary
- reason codes and missing-data flags

## Data not sent

- raw Apple Health rows
- raw workout streams
- name or email
- OpenAI API key
- Cloudflare API token
- app backup encryption material

## Setup

Run:

```bash
npm run setup:ai-coach
```

The wizard creates and deploys a separate Worker and writes:

```text
ai-coach-setup-result.local.json
```

Import that receipt in the AI Coach page. The receipt contains the Worker access
token and must never be committed or shared.

## Non-goals in v1

- free-form chat
- automatic plan modification
- medical diagnosis
- injury prediction
- sending raw health history to an external model


## Installer reliability v3

- Feature-pack tests are stored as non-discoverable templates.
- Old extracted v1/v2 pack directories are removed only when they are not tracked by Git.
- Privacy validation checks exact object keys recursively instead of matching substrings in serialized JSON.
- The installation verification runs the full Node test suite serially to avoid JSDOM timeout contention.
