# Phase 6: Documentation

## Overview
- **Priority**: P2
- **Status**: Pending
- **Effort**: 30m
- **Blocked by**: Phase 5 (needs deployment details)

Create README, CLAUDE.md, and docs/ files.

## Files to Create

### 1. `README.md` (root)

Contents:
- Project description (1 paragraph)
- Quick start: install, auth, upload
- CLI reference table (command, description, example)
- API reference table (method, path, auth, description)
- TTL options table
- Self-hosting section (wrangler setup steps)
- License

### 2. `CLAUDE.md` (root)

Contents:
- Project overview (monorepo structure)
- Development commands (`pnpm dev:worker`, `pnpm dev:cli`, `pnpm build`, `pnpm deploy`)
- Architecture summary (Worker + CLI, R2 + D1)
- File structure overview
- Key patterns (Hono routing, Commander commands, JSON-only output)
- Testing notes (wrangler dev, curl examples)

### 3. `docs/project-overview-pdr.md`

- Purpose: temporary file hosting for AI agents
- Architecture diagram (text)
- Tech stack
- Data flow

### 4. `docs/system-architecture.md`

- Component diagram
- Request flow for each endpoint
- D1 schema explanation
- Cron cleanup flow

### 5. `docs/code-standards.md`

- TypeScript strict mode
- JSON-only CLI output convention
- Error handling patterns (JSON errors, exit codes)
- File naming (kebab-case)

### 6. `docs/deployment-guide.md`

- Prerequisites (Cloudflare account, wrangler CLI, pnpm)
- Step-by-step deployment
- Custom domain setup
- Secret management
- Updating/redeploying

## Todo

- [ ] Write README.md with install + usage examples
- [ ] Write CLAUDE.md with dev commands and architecture
- [ ] Write docs/project-overview-pdr.md
- [ ] Write docs/system-architecture.md
- [ ] Write docs/code-standards.md
- [ ] Write docs/deployment-guide.md

## Success Criteria

- README has working install + usage examples
- CLAUDE.md has all dev commands and is accurate to implementation
- docs/ covers architecture, standards, and deployment
