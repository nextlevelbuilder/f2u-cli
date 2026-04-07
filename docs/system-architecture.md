# System Architecture

## Components

```
┌─────────────────────────────────────────────────────────┐
│                  Cloudflare Edge                         │
│                                                          │
│  ┌──────────────────────────┐                           │
│  │  Worker (f2u-worker)     │                           │
│  │  ├─ Hono Router          │     ┌──────────────┐     │
│  │  ├─ Auth Middleware       │────→│  R2 Bucket   │     │
│  │  ├─ Upload Handler        │     │  (f2u-files) │     │
│  │  ├─ Serve Handler         │←────│              │     │
│  │  ├─ CRUD Handlers         │     └──────────────┘     │
│  │  └─ Cron Cleanup          │                           │
│  │                            │     ┌──────────────┐     │
│  │                            │────→│  D1 Database │     │
│  │                            │←────│  (f2u-db)    │     │
│  └──────────────────────────┘     └──────────────┘     │
│                                                          │
│  Route: f2u.goclaw.sh/*                                 │
│  Cron: * * * * * (every minute)                         │
└─────────────────────────────────────────────────────────┘

┌──────────────┐
│  f2u CLI     │──── HTTPS ────→ Worker
│  (Node.js)   │←── JSON  ─────
└──────────────┘
```

## Request Flows

### Upload (POST /upload)
1. CLI sends multipart form (file + ttl) with Bearer token
2. Worker validates auth → parses form → generates UUID
3. File stored in R2 at key `{uuid}/{filename}`
4. Metadata inserted in D1 (id, filename, size, ttl, expires_at)
5. Returns JSON with `url` field pointing to `GET /:id/:filename`

### Serve (GET /:id/:filename)
1. Public — no auth required
2. Query D1 for file record by ID
3. If deleted → 410 Gone; if expired → 410 Gone; if not found → 404
4. Stream file from R2 with correct Content-Type + Cache-Control headers

### Delete (DELETE /:id)
1. Auth required (Bearer token)
2. Find record in D1, verify exists and not deleted
3. Delete object from R2
4. Mark `deleted = 1` in D1

### Cron Cleanup (every 1 minute)
1. Query D1: `WHERE deleted = 0 AND expires_at <= datetime('now') LIMIT 50`
2. Batch delete R2 objects
3. Batch update D1: `SET deleted = 1`
4. If > 50 expired, next cron invocation handles remainder

## D1 Schema

```sql
files (
  id TEXT PRIMARY KEY,          -- UUID
  filename TEXT NOT NULL,        -- Original filename
  content_type TEXT,             -- MIME type
  size INTEGER NOT NULL,         -- Bytes
  r2_key TEXT NOT NULL,          -- R2 object key: {id}/{filename}
  url TEXT NOT NULL,              -- Public URL
  ttl_seconds INTEGER NOT NULL,  -- TTL in seconds
  expires_at TEXT NOT NULL,       -- ISO 8601 expiry timestamp
  created_at TEXT NOT NULL,       -- ISO 8601 creation timestamp
  deleted INTEGER DEFAULT 0      -- Soft delete flag
)
```

Indexes: `idx_expires_at` (cron query), `idx_deleted` (filter)

## Security

- Bearer token auth on all mutation/admin endpoints
- File serving is public (URL is unguessable UUID)
- Config file stored with 0600 permissions
- No sensitive data in R2 object keys (UUID-based)
- CORS enabled for browser-based access
