# Deploy v2.8.0

1. Apply to the repaired v2.7.0 feature branch.
2. Run `npm run check` and `npm run deploy:dry-run`.
3. Confirm both Worker source files have no diff against the branch baseline.
4. Commit Phase 3.
5. Merge the feature branch into `main` only after user review.
6. Push `main` once to trigger the single production deployment.

Do not run setup or Worker deployment commands for this frontend analytics phase.
