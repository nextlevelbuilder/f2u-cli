# CLAUDE.md

## Overview

f2u (file-to-url) — temporary file hosting CLI for AI agents. Monorepo with Cloudflare Worker + CLI tool.

## Structure

```
packages/
  worker/     # Cloudflare Worker (Hono) — R2 storage + D1 metadata + cron cleanup
  cli/        # CLI tool (Commander.js) — JSON-only output for AI agents
```

## Development

```bash
pnpm install          # Install all deps
pnpm dev:worker       # Local Worker (wrangler dev)
pnpm dev:cli          # Run CLI via tsx
pnpm build            # Build all packages
pnpm build:cli        # Build CLI only
pnpm build:worker     # Build Worker only (dry-run deploy)
pnpm deploy           # Deploy Worker to Cloudflare
```

## Key Patterns

- **Worker routing**: Hono with explicit route ordering — specific paths before wildcards
- **Auth**: Bearer token middleware on protected routes; GET /:id/:filename is public
- **CLI output**: All stdout is JSON. Errors to stderr as JSON + non-zero exit code
- **Config**: `~/.config/f2u/config.json` with 0600 permissions; env var override (F2U_ENDPOINT, F2U_API_KEY)
- **Cron**: Every 1 minute, cleanup expired files (batch 50, mark deleted in D1, remove from R2)

## Worker Routes

| Method | Path | Auth | Handler |
|--------|------|------|---------|
| POST | /upload | Yes | routes/upload-route.ts |
| GET | /:id/:filename | No | routes/serve-route.ts |
| GET | /files | Yes | routes/files-route.ts |
| GET | /info/:id | Yes | routes/files-route.ts |
| DELETE | /:id | Yes | index.ts (inline) |
| GET | /usage | Yes | routes/usage-route.ts |
| GET | /health | No | index.ts |

## CLI Commands

| Command | File |
|---------|------|
| f2u auth | commands/auth-command.ts |
| f2u up | commands/upload-command.ts |
| f2u ls | commands/list-command.ts |
| f2u rm | commands/delete-command.ts |
| f2u info | commands/info-command.ts |
| f2u usage | commands/usage-command.ts |

## Testing

```bash
# Type check
cd packages/worker && npx tsc --noEmit
cd packages/cli && npx tsc --noEmit

# Test CLI locally
cd packages/cli && npx tsx src/index.ts --help
cd packages/cli && npx tsx src/index.ts up -f ./test.png -t 5m

# Test Worker locally
cd packages/worker && wrangler dev
curl http://localhost:8787/health
curl -X POST http://localhost:8787/upload -H "Authorization: Bearer test" -F "file=@test.png"
```

## Deployment

1. Fill `database_id` in `packages/worker/wrangler.toml`
2. `wrangler secret put API_KEY`
3. `pnpm deploy`
