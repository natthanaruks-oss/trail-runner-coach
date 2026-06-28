# Morning Coach v1 — Local Coach Engine

## Scope

Morning Coach v1 adds one deterministic coaching card to the Today page.

It uses the existing provider-neutral Trail Coach prescription as the source of
truth and does not call an external AI service.

## Decisions

- Pain and symptom hard stops always override performance scores.
- Missing subjective check-in keeps hard sessions controlled.
- Morning Coach never increases intensity beyond the existing prescription.
- Missing or stale data lowers confidence instead of being invented.
- The user must still open the plan or coach screen before changing a session.
- No API key and no raw health data leave the browser.

## Output

The engine returns a structured decision:

- action code
- red / yellow / green status
- planned session
- recommended session
- up to four traceable reasons
- missing data
- confidence
- decision trace
- primary and secondary routes

## Next phase

AI Coach should be added later through a Cloudflare Worker. The remote model
may explain a deterministic decision, but must not override safety gates or
change the training plan without user confirmation.
