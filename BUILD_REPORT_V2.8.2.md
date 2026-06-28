# Build report — v2.8.2

- Version: 2.8.2
- Repository verification: passed
- Tests: 95 passed, 0 failed
- Cloudflare dry-run: passed
- Assets read: 84
- IndexedDB version: 4 (unchanged)
- Wearable Sync Worker: unchanged
- Apple Health Worker: unchanged

Validated scenarios:

1. Morning + evening runs reconcile to one planned long run.
2. Combined distance, duration and vertical are summed correctly.
3. Average HR is duration-weighted and max HR uses the highest session value.
4. Run + strength are not combined.
5. One activity cannot be assigned twice.
6. Split long-run volume and continuous-specificity are reported separately.
