# f2u — File-to-URL for AI Agents

[![npm version](https://img.shields.io/npm/v/f2u-cli.svg)](https://www.npmjs.com/package/f2u-cli)

Temporary file hosting on Cloudflare R2. Upload a file, get a URL, it auto-expires.

**Why?** MCP servers cannot handle file uploads. When AI agents need to share a file (screenshot, image, document) as a URL, `f2u` provides instant upload → URL conversion with automatic cleanup.

**Designed for AI agents** — all output is JSON, no human formatting.

## Install

```bash
# From npm (recommended)
npm install -g f2u-cli

# Or with pnpm
pnpm add -g f2u-cli

# Or with yarn
yarn global add f2u-cli

# Verify installation
f2u --version
```

## Quick Start

```bash
# 1. Configure (one-time)
f2u auth --endpoint https://f2u.goclaw.sh --key YOUR_API_KEY

# 2. Upload a file (default TTL: 5 minutes)
f2u up -f ./screenshot.png
# → {"id":"abc-123","url":"https://f2u.goclaw.sh/abc-123/screenshot.png","expires_at":"..."}

# 3. Upload with custom TTL
f2u up -f ./report.pdf -t 1h

# 4. Check your uploads
f2u ls

# 5. Get file details
f2u info abc-123

# 6. Delete a file early
f2u rm abc-123

# 7. Check storage usage
f2u usage
```

## CLI Commands

All commands output JSON to stdout. Errors go to stderr as JSON with non-zero exit code.

### `f2u auth` — Configure credentials

```bash
f2u auth --endpoint https://f2u.goclaw.sh --key YOUR_API_KEY
# → {"success":true,"endpoint":"https://f2u.goclaw.sh","message":"Configuration saved."}
```

Config saved to `~/.config/f2u/config.json` (permissions: 0600).

### `f2u up` — Upload a file

```bash
f2u up -f ./image.png              # Default TTL: 5 minutes
f2u up -f ./video.mp4 -t 1h       # Custom TTL: 1 hour
f2u up -f ./document.pdf -t 24h   # Max TTL: 24 hours
```

**Response:**
```json
{
  "id": "62b1bf4e-fd92-46be-8f57-ed73fd58588d",
  "filename": "image.png",
  "url": "https://f2u.goclaw.sh/62b1bf4e-fd92-46be-8f57-ed73fd58588d/image.png",
  "size": 280591,
  "content_type": "image/png",
  "ttl": "5m",
  "ttl_seconds": 300,
  "expires_at": "2026-04-07T13:10:00.000Z",
  "created_at": "2026-04-07T13:05:00.000Z"
}
```

### `f2u ls` — List active files

```bash
f2u ls
# → {"files":[...],"count":3}
```

### `f2u info <id>` — File details + TTL remaining

```bash
f2u info 62b1bf4e-fd92-46be-8f57-ed73fd58588d
# → {"id":"...","ttl_remaining":221,"expired":false,...}
```

### `f2u rm <id>` — Delete a file

```bash
f2u rm 62b1bf4e-fd92-46be-8f57-ed73fd58588d
# → {"id":"...","deleted":true}
```

### `f2u usage` — Storage stats

```bash
f2u usage
# → {"active":{"count":3,"bytes":561197},"all_time":{"count":10,"bytes":1234567}}
```

## TTL Options

| Value | Duration |
|-------|----------|
| `5m` | 5 minutes **(default)** |
| `15m` | 15 minutes |
| `30m` | 30 minutes |
| `1h` | 1 hour |
| `6h` | 6 hours |
| `12h` | 12 hours |
| `24h` | 24 hours (maximum) |

Files are automatically deleted after TTL expires. The cron cleanup runs every minute.

## Supported File Types

Auto-detected MIME types for proper browser preview:

| Category | Extensions |
|----------|-----------|
| **Images** | jpg, jpeg, png, gif, webp, svg |
| **Documents** | pdf, json, txt, html, css, js, ts, csv, xml, md, yaml |
| **Audio** | mp3, wav, ogg, flac, aac, m4a, wma, opus |
| **Video** | mp4, webm, avi, mov, mkv, flv, wmv, m4v, 3gp |
| **Archives** | zip, gz, tar |

Other file types default to `application/octet-stream`.

## Environment Variables

Credentials are resolved per-field with the following precedence (high → low):

1. `process.env` — OS-level, shell-exported, or inline (`F2U_API_KEY=… f2u up …`)
2. `.env.local` in current working directory
3. `.env.${NODE_ENV}` in current working directory (e.g. `.env.production`)
4. `.env` in current working directory
5. `~/.config/f2u/config.json` (saved via `f2u auth`)

Partial overrides are allowed — e.g. set `F2U_ENDPOINT` via env while keeping `F2U_API_KEY` in the config file.

```bash
# Inline (CI/CD)
F2U_ENDPOINT=https://f2u.goclaw.sh F2U_API_KEY=sk_xxx f2u up -f ./file.png

# Shell export
export F2U_API_KEY=sk_xxx
f2u up -f ./file.png

# Project-local .env file (auto-loaded from CWD)
echo "F2U_API_KEY=sk_xxx" >> .env.local
f2u up -f ./file.png
```

| Variable | Description |
|----------|-------------|
| `F2U_ENDPOINT` | Worker API URL |
| `F2U_API_KEY` | API authentication key |

## API Reference

Base URL: `https://f2u.goclaw.sh`

All protected endpoints require `Authorization: Bearer <API_KEY>` header.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/upload` | Bearer | Upload file (multipart: `file` + `ttl`) |
| `GET` | `/:id/:filename` | **Public** | Serve file (410 if expired) |
| `GET` | `/files` | Bearer | List active files |
| `GET` | `/info/:id` | Bearer | File details + TTL remaining |
| `DELETE` | `/:id` | Bearer | Delete file |
| `GET` | `/usage` | Bearer | Storage stats |
| `GET` | `/health` | **Public** | Health check |

### Upload via curl

```bash
curl -X POST https://f2u.goclaw.sh/upload \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "file=@./image.png" \
  -F "ttl=5m"
```

### Serve file (public — no auth needed)

```bash
curl https://f2u.goclaw.sh/62b1bf4e-fd92-46be-8f57-ed73fd58588d/image.png
# Or just open the URL in a browser
```

## Architecture

```
┌─────────┐     POST /upload      ┌──────────────────────┐
│  f2u    │ ──────────────────→  │  Cloudflare Worker    │
│  CLI    │                       │  (Hono)               │
│         │  ←───── JSON ──────  │                        │
└─────────┘                       │  ┌────────┐ ┌──────┐  │
                                  │  │   R2   │ │  D1  │  │
Browser/Agent ── GET /:id/:fn ──→ │  │ files  │ │  db  │  │
              ←── file bytes ──── │  └────────┘ └──────┘  │
                                  │                        │
                                  │  Cron (every 1 min):   │
                                  │  cleanup expired files │
                                  └──────────────────────┘
```

| Component | Role |
|-----------|------|
| **R2** | File storage (auto-cleaned by cron) |
| **D1** | SQLite database for file metadata + expiry tracking |
| **Worker** | API handler + scheduled cron cleanup |
| **Domain** | `f2u.goclaw.sh` (custom domain on Cloudflare) |

## Self-Hosting

### Prerequisites

- Cloudflare account (free tier works) with R2 + D1 enabled
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`npm install -g wrangler`)
- Node.js 18+
- pnpm

### Setup

```bash
# Clone and install
git clone https://github.com/nextlevelbuilder/f2u-cli.git
cd f2u-cli
pnpm install

# Create R2 bucket
wrangler r2 bucket create f2u-files

# Create D1 database
wrangler d1 create f2u-db
# Copy the database_id from output into packages/worker/wrangler.toml

# Apply database schema
cd packages/worker
wrangler d1 execute f2u-db --file=src/db/schema.sql --remote

# (Optional) Legacy single API key — for CLI access without the dashboard
wrangler secret put API_KEY

# GitHub OAuth — required for the web dashboard
# 1. Create an OAuth App at https://github.com/settings/developers
#    Authorization callback URL: https://your-domain.com/auth/github/callback
# 2. Set the credentials as Worker secrets:
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET

# 3. (Strongly recommended) Restrict who can sign in. Edit wrangler.toml [vars]:
#    ADMIN_GITHUB_USERS = "your-github-login,teammate-login"
#    Leave empty to allow ANY GitHub user (not recommended for personal deploys).

# Update custom domain in wrangler.toml (optional)
# Edit [[routes]] pattern to your domain
# Also update BASE_URL under [vars] to match.

# Deploy
wrangler deploy

# Verify
curl https://your-domain.com/health
# Then visit https://your-domain.com/login in a browser
```

### Web Dashboard

Once deployed, visit `https://your-domain.com/login` to sign in with GitHub
and manage API keys from the browser. Created keys are shown **once** —
copy them immediately. Use them with the CLI via `f2u auth --key <KEY>`
or as the `Authorization: Bearer <KEY>` header.

The legacy `API_KEY` secret (if set) continues to work for backwards
compatibility alongside dashboard-issued keys.

### Custom Domain

1. Your domain must be on Cloudflare DNS (proxied)
2. Edit `packages/worker/wrangler.toml`:
   ```toml
   [[routes]]
   pattern = "your-domain.com"
   custom_domain = true
   ```
3. Redeploy: `wrangler deploy`

## Development

```bash
pnpm install         # Install all dependencies
pnpm dev:worker      # Start Worker locally (wrangler dev)
pnpm dev:cli         # Run CLI in dev mode (tsx)
pnpm build           # Build all packages
pnpm build:cli       # Build CLI only
pnpm build:worker    # Build Worker only
pnpm deploy          # Deploy Worker to Cloudflare
```

## Limits

| Limit | Value |
|-------|-------|
| Max file size | 100 MB (Workers memory constraint) |
| Max TTL | 24 hours |
| Default TTL | 5 minutes |
| Cleanup interval | 1 minute |
| List limit | 100 files per request |

## License

MIT
