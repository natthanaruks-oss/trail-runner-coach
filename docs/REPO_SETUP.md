# New repository and Cloudflare setup

## GitHub

Create a private repository named `trail-runner-coach` without generating a README or `.gitignore`, because both already exist in this package.

```bash
git init
git add .
git commit -m "Initial Trail Runner Coach foundation"
git branch -M main
git remote add origin https://github.com/YOUR_ACCOUNT/trail-runner-coach.git
git push -u origin main
```

Before the first push, run:

```bash
npm install
npm run check
```

Confirm that no personal backup, InBody file, Apple Health export, GPX/TCX/FIT file, token or `.env` appears in `git status`.

## Cloudflare

1. Open Workers & Pages and create a project from the new GitHub repository.
2. Use the repository root as the root directory.
3. Deployment command: `npx wrangler deploy`.
4. No build output directory is required; Wrangler reads `assets.directory` from `wrangler.jsonc`.
5. Node.js is pinned to 20 through `.node-version` and `package.json`.

The Cloudflare project name is `trail-runner-coach`. If that name is already used in the account, change only `wrangler.jsonc`; keep the product and package names unchanged.

## iOS companion

Deploy the web app first, then enter its HTTPS URL in the iOS companion. The companion is a separate Xcode build and is not deployed by Cloudflare.
