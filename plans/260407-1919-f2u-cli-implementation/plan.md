---
title: "f2u-cli: Temporary File Upload CLI + Cloudflare Worker"
description: "CLI tool for AI agents to upload temporary files to Cloudflare R2 with auto-expiry"
status: pending
priority: P1
effort: 8h
branch: kai/feat/f2u-cli-implementation
tags: [cloudflare, r2, d1, cli, worker, typescript]
created: 2026-04-07
---

# f2u-cli Implementation Plan

## Summary

Monorepo with two packages: a Cloudflare Worker (Hono) serving as the file upload API on `f2u.goclaw.sh`, and a CLI tool (`f2u`) for AI agents to upload/manage temporary files stored in R2 with D1 metadata tracking and automatic TTL-based cleanup.

## Data Flow

```
CLI (f2u up) → POST /upload (multipart + Bearer token)
  → Worker validates auth → generates UUID → stores file in R2
  → inserts metadata in D1 → returns JSON { id, url, expires_at }

Browser/Agent → GET /:id/:filename
  → Worker checks D1 → if expired/deleted → 410 Gone
  → if valid → streams from R2 with correct Content-Type

Cron (every 1min) → query D1 WHERE expires_at < now AND deleted=0
  → batch delete from R2 → mark deleted=1 in D1
```

## Phases

| # | Phase | Status | Effort | Files |
|---|-------|--------|--------|-------|
| 1 | [Project Setup](phase-01-project-setup.md) | Pending | 1h | root configs, package.json, tsconfig |
| 2 | [Worker API](phase-02-worker-api.md) | Pending | 3h | packages/worker/src/** |
| 3 | [Worker Cron](phase-03-worker-cron.md) | Pending | 30m | packages/worker/src/cron/** |
| 4 | [CLI Tool](phase-04-cli-tool.md) | Pending | 2h | packages/cli/src/** |
| 5 | [Deployment Config](phase-05-deployment-config.md) | Pending | 1h | wrangler.toml, schema.sql |
| 6 | [Documentation](phase-06-documentation.md) | Pending | 30m | README.md, docs/*, CLAUDE.md |

## Dependencies

```
Phase 1 → Phase 2, 3, 4 (all need project scaffold)
Phase 2 → Phase 3 (cron reuses DB helpers)
Phase 2 → Phase 4 (CLI calls Worker API)
Phase 1 → Phase 5 (wrangler config needs package structure)
Phase 5 → Phase 6 (docs reference deployment)
```

## Key Decisions

- **Hono** over itty-router: better TypeScript support, middleware pattern
- **pnpm workspace**: keeps worker and CLI in one repo with shared tsconfig
- **JSON-only CLI output**: designed for AI agent consumption, no pretty tables
- **Soft delete**: `deleted` flag in D1 prevents re-serving expired files before cron runs
- **1-min cron**: Cloudflare Workers minimum cron interval; Worker also checks expiry on GET

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| R2 multipart upload size limits | Low | High | Cloudflare Workers have 100MB request limit; document max file size |
| D1 query latency on cron cleanup | Low | Low | Batch deletes in groups of 50; D1 handles this fine for expected volume |
| Bearer token leaked in CLI config | Medium | High | File permissions 0600 on config.json; warn in docs |
| Cron misses expired files | Low | Medium | GET route also checks expiry; belt-and-suspenders |

## Rollback

- Each phase is independently revertible via git
- Worker deployment: `wrangler rollback` to previous version
- D1 schema: single table, DROP TABLE to reset
- CLI: unpublish from npm if needed

## Success Criteria

- [ ] `f2u up -f test.png` uploads and returns accessible URL
- [ ] URL returns 410 after TTL expires
- [ ] `f2u ls` / `f2u rm` / `f2u info` / `f2u usage` all return valid JSON
- [ ] Cron cleans up expired files within 2 minutes of expiry
- [ ] Worker responds < 200ms for file serve (p95)
