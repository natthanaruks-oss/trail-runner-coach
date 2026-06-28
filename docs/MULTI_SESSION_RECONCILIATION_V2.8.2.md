# Multi-session plan reconciliation — v2.8.2

## Purpose

Support athletes who train more than once per day without losing actual training load or incorrectly showing a planned workout as incomplete.

## Behaviour

- Daily strain and weekly load continue to include every canonical activity.
- Up to four compatible activities on the same day can be evaluated as one planned session.
- A bundle is only considered when every activity has a compatible type and none is already linked to another planned workout.
- Distance, duration, vertical gain/loss, active energy and session load are summed.
- Average HR and RPE are duration-weighted; maximum HR uses the highest observed value.
- Split-session matches require a higher automatic-match threshold than single activities.
- Long-run volume and continuous-endurance specificity are reported separately.

## Long-run interpretation

A 12 km morning run plus an 8 km evening run can complete 100% of a 20 km volume target, but it does not provide the same continuous endurance stimulus as one uninterrupted 20 km run. The app therefore records both:

- `volumeCompletionPct`
- `continuousCompletionPct`
- `specificityPct`

## Safety and controls

- Run and strength sessions are never combined.
- One activity cannot be linked to more than one planned session.
- Manual rejections, skips and edits remain protected from automatic overwrite.
- No database migration is required; IndexedDB remains version 4.
- No Worker, token, KV or provider configuration is changed.
