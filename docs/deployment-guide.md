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

### 6. Set API Key Secret

```bash
wrangler secret put API_KEY
# Enter your chosen API key when prompted
```

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

```bash
cd packages/cli
pnpm build
npm publish  # publishes f2u-cli to npm
```

Users install: `npm install -g f2u-cli`

## Monitoring

- Worker logs: `wrangler tail`
- D1 queries: `wrangler d1 execute f2u-db --command "SELECT COUNT(*) FROM files"`
- R2 stats: Cloudflare dashboard → R2 → f2u-files
