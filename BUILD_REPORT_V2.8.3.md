# Build report — v2.8.3

- Version: 2.8.3
- Scope: Wake-day recovery alignment and automatic readiness calculation
- Repository verification: passed
- Tests: 99 passed, 0 failed
- Cloudflare deploy dry-run: passed
- Static assets: 84 files
- IndexedDB version: 4 (unchanged)
- Worker code: unchanged

## Verified behavior

- Health Auto Export sleep, Resting HR and HRV dated on the prior calendar day are aligned to the following wake day.
- Overnight recovery remains active for the full readiness day, including after morning and evening workouts sync.
- Steps, active energy, exercise minutes and daily distance remain on their own calendar day and do not roll forward.
- The Today selector can calculate a conservative automatic readiness preview before a manual subjective check-in is saved.
- Source dates and effective readiness dates are stored separately for traceability.
- Pain and illness safety gates remain authoritative.
