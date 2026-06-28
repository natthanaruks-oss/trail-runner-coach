# Deploy v2.8.3

Apply this patch on top of v2.8.2.

```bash
node -p "require('./package.json').version"
# expected: 2.8.2

npm install
npm run check
# expected: 99 tests, 99 pass, 0 fail

npm run deploy:dry-run
```

Commit and deploy through the existing feature branch and main-branch workflow.

Do not run provider setup or Worker deployment commands. This release does not change Cloudflare Workers, tokens, secrets, KV bindings or database schema.
