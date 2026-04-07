# Phase 5: Deployment Config

## Overview
- **Priority**: P1
- **Status**: Pending
- **Effort**: 1h
- **Blocked by**: Phase 1

Wrangler configuration, D1 database setup, R2 bucket creation, custom domain binding, and secrets.

## Implementation Steps

### 1. D1 schema — `packages/worker/src/db/schema.sql`

```sql
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  content_type TEXT,
  size INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  url TEXT NOT NULL,
  ttl_seconds INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_expires_at ON files(expires_at);
CREATE INDEX IF NOT EXISTS idx_deleted ON files(deleted);
```

### 2. Wrangler config — `packages/worker/wrangler.toml`

```toml
name = "f2u-worker"
main = "src/index.ts"
compatibility_date = "2024-12-01"

[triggers]
crons = ["* * * * *"]

[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "f2u-files"

[[d1_databases]]
binding = "D1_DATABASE"
database_name = "f2u-db"
database_id = "" # Fill after `wrangler d1 create f2u-db`

[routes]
pattern = "f2u.goclaw.sh/*"
custom_domain = true
```

**Note**: `database_id` must be filled after running `wrangler d1 create`.

### 3. Setup commands (run manually)

```bash
# Create R2 bucket
wrangler r2 bucket create f2u-files

# Create D1 database
wrangler d1 create f2u-db
# Copy the database_id from output into wrangler.toml

# Apply schema
wrangler d1 execute f2u-db --file=src/db/schema.sql

# Set API key secret
wrangler secret put API_KEY
# Enter the secret value when prompted

# Custom domain (must be on Cloudflare DNS already)
# Add CNAME record: f2u.goclaw.sh -> f2u-worker.<account>.workers.dev
# Or configure via wrangler.toml routes (shown above)

# Deploy
wrangler deploy
```

### 4. NPM publish config for CLI

In `packages/cli/package.json`, ensure:

```json
{
  "name": "f2u-cli",
  "version": "0.1.0",
  "bin": { "f2u": "./dist/index.js" },
  "files": ["dist"],
  "publishConfig": {
    "access": "public"
  }
}
```

Publish: `cd packages/cli && pnpm build && npm publish`

## Todo

- [ ] Create schema.sql with table + indexes
- [ ] Create wrangler.toml with R2, D1, cron, and route config
- [ ] Run `wrangler r2 bucket create f2u-files`
- [ ] Run `wrangler d1 create f2u-db` and copy database_id
- [ ] Run `wrangler d1 execute f2u-db --file=src/db/schema.sql`
- [ ] Run `wrangler secret put API_KEY`
- [ ] Configure DNS for f2u.goclaw.sh
- [ ] Run `wrangler deploy` and verify health endpoint
- [ ] Test upload via curl to verify end-to-end
- [ ] Configure CLI npm publish settings

## Success Criteria

- `wrangler deploy` succeeds
- `curl https://f2u.goclaw.sh/health` returns `{"status":"ok"}`
- D1 schema applied (check via `wrangler d1 execute f2u-db --command "SELECT name FROM sqlite_master"`)
- R2 bucket exists and is bound
- Custom domain resolves correctly
