# AI Coach — Cloudflare Workers AI

## Architecture

The deterministic Local Coach remains the source of truth.

Cloudflare Workers AI only explains the existing decision. It cannot change:

- action code
- red/yellow/green status
- safety lock
- distance
- vertical
- intensity
- rest or pain guidance

The browser and Worker both validate the returned explanation.

## Provider

Default model:

```text
@cf/qwen/qwen3-30b-a3b-fp8
```

The Worker uses an `AI` binding:

```json
{
  "ai": {
    "binding": "AI"
  }
}
```

No OpenAI API key is required.

## Secrets

Only one Worker secret is required:

```text
AI_COACH_ACCESS_TOKEN
```

The setup wizard generates this automatically and stores it through Wrangler.

## Setup

```bash
npm run setup:ai-coach
```

The wizard asks for:

- production web-app URL
- Worker name
- Workers AI model

It creates:

```text
ai-coach-setup-result.local.json
```

Import this receipt into the AI Coach page, then delete the local receipt.

## Privacy

The AI snapshot excludes:

- raw health rows
- workout streams
- name and email
- API keys
- Cloudflare deployment credentials

## Cost control

- Browser cache: 12 hours per snapshot
- Output limit: 700 tokens
- One retry only when structured output fails
- AI never runs automatically
- Users explicitly press Ask AI Coach
