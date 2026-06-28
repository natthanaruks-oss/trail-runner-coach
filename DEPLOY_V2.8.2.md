# Deploy v2.8.2

Apply this patch after v2.8.1.

```bash
npm install
npm run check
npm run deploy:dry-run
```

Expected result:

```text
tests 95
pass 95
fail 0
```

Commit and push the feature branch. Merge into `main` only after final verification.

Do not deploy or reconfigure any Worker for this release.
