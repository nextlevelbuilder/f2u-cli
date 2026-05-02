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
│  │  │  (Bearer + cookie)     │     │  (f2u-files) │     │
│  │  ├─ File API              │←────│              │     │
│  │  ├─ Web pages (HTML)      │     └──────────────┘     │
│  │  ├─ OAuth + Sessions      │                           │
│  │  ├─ Dashboard API         │     ┌──────────────┐     │
│  │  └─ Cron Cleanup          │────→│  D1 Database │     │
│  │                            │←────│  (f2u-db)    │     │
│  └──────────────────────────┘     └──────────────┘     │
│                                          ↑               │
│  Route: f2u.goclaw.sh/*           ┌──────┴───────┐     │
│  Cron: * * * * * (every minute)   │ GitHub OAuth │     │
│                                    └──────────────┘     │
└─────────────────────────────────────────────────────────┘

┌──────────────┐                  ┌──────────────┐
│  f2u CLI     │──── HTTPS ────→  │   Browser    │──── HTTPS ────→ Worker
│  (Node.js)   │←── JSON  ─────   │  Dashboard   │←── HTML/JSON ──
└──────────────┘                  └──────────────┘
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

### Dashboard Login (GET /login → /auth/github → /auth/github/callback)
1. Browser hits `/login` → renders sign-in page (Tailwind via CDN)
2. Click "Sign in" → `/auth/github` → set state cookie, redirect to GitHub
3. GitHub redirects back with `code` + `state` → Worker validates state cookie
4. Exchange `code` → access_token; fetch GitHub profile
5. Allowlist check (`ADMIN_GITHUB_USERS`) — 403 if disallowed
6. Upsert into `users`; create `sessions` row (30-day TTL)
7. Set HttpOnly Secure SameSite=Lax `f2u_session` cookie → redirect `/dashboard`

### Dashboard API (cookie-gated)
- `GET /api/me` — current user profile
- `GET /api/keys` — list user's keys (no plaintext)
- `POST /api/keys` — create key, returns `f2u_<32-byte-hex>` plaintext **once**
- `DELETE /api/keys/:id` — revoke key (sets `revoked = 1`)

### Bearer Auth (CLI / HTTP API)
1. Extract `Authorization: Bearer <token>`
2. Constant-time compare against legacy `API_KEY` env (if set) → allow
3. Otherwise sha-256 hash token → lookup `api_keys WHERE key_hash = ? AND revoked = 0`
4. On match: `waitUntil` updates `last_used_at`, allow

## D1 Schema

```sql
files (
  id TEXT PRIMARY KEY,           -- UUID
  filename TEXT NOT NULL,
  content_type TEXT,
  size INTEGER NOT NULL,
  r2_key TEXT NOT NULL,          -- {id}/{filename}
  url TEXT NOT NULL,
  ttl_seconds INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted INTEGER DEFAULT 0
)

users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  github_id INTEGER NOT NULL UNIQUE,
  github_login TEXT NOT NULL,
  name TEXT, email TEXT, avatar_url TEXT,
  created_at TEXT NOT NULL,
  last_login_at TEXT
)

api_keys (
  id TEXT PRIMARY KEY,           -- UUID
  user_id INTEGER NOT NULL,      -- FK users
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE, -- sha-256 of plaintext
  prefix TEXT NOT NULL,          -- first 12 chars for display
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked INTEGER DEFAULT 0
)

sessions (
  id TEXT PRIMARY KEY,           -- random 32-byte hex
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
)
```

Indexes: `idx_expires_at`, `idx_deleted`, `idx_users_github_id`,
`idx_api_keys_user`, `idx_api_keys_hash`, `idx_sessions_expires`.

## Security

- Bearer token auth on file API; sessions cookie on dashboard API
- API keys stored as sha-256 hashes — plaintext shown **only on creation**
- Constant-time compare (`safeEqual`) for legacy `API_KEY`
- Session cookie: HttpOnly + Secure + SameSite=Lax, 30-day TTL
- OAuth state cookie (10-min TTL) for CSRF protection on callback
- `ADMIN_GITHUB_USERS` allowlist (empty = open mode — discouraged in prod)
- File serving is public (URL is unguessable UUID)
- Config file stored with 0600 permissions
- CORS enabled for browser-based access
