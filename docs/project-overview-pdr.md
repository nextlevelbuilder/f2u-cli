# f2u — Project Overview

## Purpose

Temporary file hosting for AI agents. MCP servers cannot handle file uploads natively — when AI tools need a URL for a file (screenshot, document, image), f2u provides a simple upload-and-get-URL flow with automatic expiry.

## Problem

AI agents (Claude, GPT, etc.) operating via MCP or CLI tools often need to share files as URLs. No lightweight solution exists that:
- Provides instant file-to-URL conversion
- Auto-expires files (security/storage hygiene)
- Outputs machine-readable JSON (not human-formatted text)
- Runs entirely on Cloudflare edge (low latency, no server management)

## Solution

Three-part system:
1. **CLI tool** (`f2u`) — upload files, manage uploads, all JSON output
2. **Cloudflare Worker** — API + file serving + cron cleanup
3. **Web Dashboard** (served by the Worker) — GitHub OAuth login + API key management

## Tech Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| API/Routing | Hono on Cloudflare Workers | Lightweight, TypeScript, edge-native |
| File Storage | Cloudflare R2 | S3-compatible, no egress fees via Workers |
| Metadata DB | Cloudflare D1 | SQLite at edge, zero config |
| CLI Framework | Commander.js | Minimal, well-maintained |
| Build | tsup (CLI), wrangler (Worker) | Fast, zero-config bundlers |
| Monorepo | pnpm workspaces | Simple, fast |

## Data Flow

```
Upload:    CLI → POST /upload → Worker → R2 (file) + D1 (metadata) → JSON response
Serve:     Browser/Agent → GET /:id/:filename → Worker → D1 check → R2 stream
Cleanup:   Cron (1min) → Worker → D1 query expired → R2 delete → D1 mark deleted
Dashboard: Browser → /login → GitHub OAuth → /dashboard → /api/keys CRUD
Auth:      CLI Bearer key → authMiddleware → D1 api_keys (sha-256 hash) lookup
```

## Domain

- Production: `f2u.goclaw.sh`
- GitHub: `nextlevelbuilder/f2u-cli`
