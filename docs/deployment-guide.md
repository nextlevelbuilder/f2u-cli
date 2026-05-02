# Deployment Guide

## Prerequisites

- Cloudflare account (free tier works)
- R2 enabled on account
- D1 enabled on account
- Node.js 18+
- pnpm
- Wrangler CLI: `npm install -g wrangler`
- Authenticated: `wrangler login`

## Step-by-Step Deployment

### 1. Clone and Install

```bash
git clone https://github.com/nextlevelbuilder/f2u-cli.git
cd f2u-cli
pnpm install
```

### 2. Create R2 Bucket

```bash
wrangler r2 bucket create f2u-files
```

### 3. Create D1 Database

```bash
wrangler d1 create f2u-db
```

Copy the `database_id` from output.

### 4. Configure wrangler.toml

Edit `packages/worker/wrangler.toml`:

```toml
[[d1_databases]]
binding = "D1_DATABASE"
database_name = "f2u-db"
database_id = "YOUR_DATABASE_ID_HERE"  # ← paste here
```

Update route pattern if using a different domain:

```toml
[routes]
pattern = "your-domain.com/*"
custom_domain = true
```

### 5. Apply Database Schema

```bash
cd packages/worker
wrangler d1 execute f2u-db --file=src/db/schema.sql
```

### 6. Set Secrets

**Legacy single key (optional)** — for shared CLI access without dashboard:

```bash
wrangler secret put API_KEY
```

**GitHub OAuth (required for the web dashboard):**

1. Create a new OAuth App at https://github.com/settings/developers
   - Authorization callback URL: `https://your-domain.com/auth/github/callback`
2. Set the credentials as Worker secrets:

```bash
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
```

3. (Strongly recommended) Restrict who can sign in. Edit `wrangler.toml`:

```toml
[vars]
BASE_URL = "https://your-domain.com"
ADMIN_GITHUB_USERS = "your-github-login,teammate-login"
```

Leave `ADMIN_GITHUB_USERS` empty to allow ANY GitHub user (not recommended).

### 7. Deploy

```bash
pnpm deploy
# or: cd packages/worker && wrangler deploy
```

### 8. Verify

```bash
curl https://f2u.goclaw.sh/health
# → {"status":"ok","ts":"2026-04-07T..."}
```

Then visit `https://your-domain.com/login` in a browser → sign in with
GitHub → create your first API key from the dashboard.

## Releases (Automated)

Conventional commits on `main` trigger
[release-please](https://github.com/googleapis/release-please) — it opens a
"chore: release main" PR that bumps `packages/cli` version + CHANGELOG.
Merging that PR creates a tag, GitHub Release, and publishes
`f2u-cli` to npm via `.github/workflows/release.yml`.

Required GitHub secret: `NPM_TOKEN` (granular token with publish access
to the `f2u-cli` package). The Worker is **not** auto-deployed by CI —
run `pnpm --filter @f2u/worker deploy` manually or extend the workflow.

## Custom Domain Setup

1. Domain must be on Cloudflare DNS (proxied)
2. Add CNAME record: `f2u` → `f2u-worker.<account>.workers.dev`
3. Or use the `[routes]` config in wrangler.toml with `custom_domain = true`

## Updating

```bash
git pull
pnpm install
pnpm deploy
```

## CLI Distribution

Automated via release-please (see "Releases (Automated)" above). Users install
the published package: `npm install -g f2u-cli`.

## Monitoring

- Worker logs: `wrangler tail`
- D1 queries: `wrangler d1 execute f2u-db --command "SELECT COUNT(*) FROM files"`
- R2 stats: Cloudflare dashboard → R2 → f2u-files
