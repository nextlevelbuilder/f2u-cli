# f2u — File-to-URL for AI Agents

Temporary file hosting on Cloudflare R2. Upload a file, get a URL, it auto-expires.

Built for AI agents and MCP servers that need to share files via URLs.

## Quick Start

```bash
# Install CLI
npm install -g f2u-cli

# Configure (one-time)
f2u auth --endpoint https://f2u.goclaw.sh --key YOUR_API_KEY

# Upload a file (default TTL: 5 minutes)
f2u up -f ./screenshot.png
# → {"id":"abc-123","url":"https://f2u.goclaw.sh/abc-123/screenshot.png","expires_at":"..."}

# Upload with custom TTL
f2u up -f ./report.pdf -t 1h
```

## CLI Commands

All commands output JSON to stdout. Errors go to stderr as JSON.

| Command | Description | Example |
|---------|-------------|---------|
| `f2u auth` | Configure endpoint + API key | `f2u auth --endpoint https://f2u.goclaw.sh --key sk_xxx` |
| `f2u up` | Upload a file | `f2u up -f ./image.png -t 15m` |
| `f2u ls` | List active files | `f2u ls` |
| `f2u rm <id>` | Delete a file | `f2u rm abc-123` |
| `f2u info <id>` | File details + TTL remaining | `f2u info abc-123` |
| `f2u usage` | Storage usage stats | `f2u usage` |

## TTL Options

| Value | Duration |
|-------|----------|
| `5m` | 5 minutes (default) |
| `15m` | 15 minutes |
| `30m` | 30 minutes |
| `1h` | 1 hour |
| `6h` | 6 hours |
| `12h` | 12 hours |
| `24h` | 24 hours |

## Environment Variables

Override config file with environment variables:

```bash
F2U_ENDPOINT=https://f2u.goclaw.sh F2U_API_KEY=sk_xxx f2u up -f ./file.png
```

Config file location: `~/.config/f2u/config.json` (permissions: 0600)

## API Reference

Base URL: `https://f2u.goclaw.sh`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/upload` | Bearer | Upload file (multipart form: `file` + `ttl`) |
| `GET` | `/:id/:filename` | Public | Serve file (returns 410 if expired) |
| `GET` | `/files` | Bearer | List active files |
| `GET` | `/info/:id` | Bearer | File details |
| `DELETE` | `/:id` | Bearer | Delete file |
| `GET` | `/usage` | Bearer | Storage stats |
| `GET` | `/health` | Public | Health check |

### Upload via curl

```bash
curl -X POST https://f2u.goclaw.sh/upload \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "file=@./image.png" \
  -F "ttl=5m"
```

## Architecture

```
┌─────────┐     POST /upload      ┌──────────────────┐
│  f2u    │ ──────────────────→  │  Cloudflare       │
│  CLI    │                       │  Worker           │
│         │  ←───── JSON ──────  │  (Hono)           │
└─────────┘                       │                    │
                                  │  ┌──────┐ ┌─────┐ │
Browser/Agent ── GET /:id/:fn ──→ │  │  R2  │ │ D1  │ │
              ←── file bytes ──── │  └──────┘ └─────┘ │
                                  │                    │
                                  │  Cron (1min):      │
                                  │  cleanup expired   │
                                  └──────────────────┘
```

- **R2**: File storage (auto-cleaned by cron)
- **D1**: File metadata + expiry tracking
- **Worker**: API handler + cron cleanup
- **Domain**: `f2u.goclaw.sh`

## Self-Hosting

### Prerequisites

- Cloudflare account with R2 + D1 enabled
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
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
# Copy database_id into packages/worker/wrangler.toml

# Apply schema
cd packages/worker
wrangler d1 execute f2u-db --file=src/db/schema.sql

# Set API key
wrangler secret put API_KEY

# Deploy
wrangler deploy
```

### Custom Domain

1. Add your domain to Cloudflare DNS
2. Update `packages/worker/wrangler.toml` route pattern
3. Redeploy: `wrangler deploy`

## Development

```bash
pnpm dev:worker    # Start Worker locally
pnpm dev:cli       # Run CLI in dev mode
pnpm build         # Build all packages
pnpm deploy        # Deploy Worker to Cloudflare
```

## License

MIT
