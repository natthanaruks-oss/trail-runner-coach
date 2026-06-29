# Home Coach Surface & Reactive Recommendation Engine

## Product decision

The home screen has one coaching surface:

1. Local Coach makes the deterministic recommendation.
2. AI Coach explains the recommendation.
3. AI never changes distance, vertical, intensity, action code or safety lock.

## Placement

The Home Coach Surface is rendered immediately below the Readiness Hero and
before the training-state cards. This keeps readiness, today's action and the
AI explanation in one visual hierarchy.

## Reactive behavior

### Every data update

- The dashboard recalculates Readiness and Local Coach immediately.
- The Local Coach result is always visible without waiting for AI.

### Material recommendation change

AI refreshes automatically after a 2.4-second settle period when one of these
changes:

- date
- action code
- red/yellow/green status
- safety lock
- suggested type
- distance
- vertical
- intensity
- planned session
- readiness band
- recovery/load/energy band
- race stage

### Minor data change

A score change such as Readiness 82 to 84 does not call AI again when the
material recommendation remains the same. The UI states that the recommendation
is unchanged after the latest data update.

### Wearable and workout sync

The application rerenders the Today route after the sync-state event, so the
Local Coach and AI explanation can react to newly imported health or activity
data.

## Request controls

- debounce: 2.4 seconds
- same-key request deduplication
- stale-response protection using sequence IDs
- manual refresh remains available
- AI failure never removes the Local Coach recommendation
