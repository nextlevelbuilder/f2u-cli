# Project Roadmap

Living document — phases evolve as we ship. Update status when work moves.

## Phase 1 — Core (Done)

- [x] CLI: upload, list, info, delete, usage commands (JSON output)
- [x] Worker: R2 storage + D1 metadata + cron cleanup (1-min interval)
- [x] Bearer token auth via env `API_KEY`
- [x] Public file serving with TTL expiry (5m–24h)
- [x] Custom domain `f2u.goclaw.sh`
- [x] Automated release pipeline (release-please → npm)

## Phase 2 — Multi-user Dashboard (Done — v0.3.0)

- [x] GitHub OAuth login + HttpOnly session cookies
- [x] Web dashboard at `/login`, `/dashboard` (Tailwind CDN, vanilla JS)
- [x] D1 tables: `users`, `api_keys` (sha-256 hashed), `sessions`
- [x] Dashboard API: `/api/me`, `/api/keys` CRUD with revoke
- [x] `authMiddleware` accepts dashboard-issued keys + legacy `API_KEY`
- [x] `ADMIN_GITHUB_USERS` allowlist
- [x] CLI: default endpoint `https://f2u.goclaw.sh` (no `--endpoint` needed)

## Phase 3 — Quotas & Rate Limiting (Planned)

**Goal:** Protect the public deployment from abuse and prepare the data model
for tiered limits.

- [ ] **Per-key rate limiting** — sliding window or token bucket via
      Cloudflare KV / Durable Object counters; HTTP 429 with `Retry-After`
- [ ] **Per-user storage quota** — track `bytes_used` aggregate in `users`,
      block uploads when over limit
- [ ] **Per-user upload count cap** (per-day / per-month)
- [ ] **Max file size** override per tier (currently flat 100 MB)
- [ ] **Max TTL** override per tier (currently flat 24h)
- [ ] **Concurrent uploads cap** per user
- [ ] **Rate-limit headers**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`,
      `X-RateLimit-Reset` on every protected response
- [ ] **Dashboard: usage panel** — show current consumption vs. plan limits
- [ ] **CLI: `f2u usage` reflects plan limits** (not just storage stats)
- [ ] **Admin: per-user override** — bump limits for individual accounts
      without changing their tier

**Open questions:**
- KV vs. Durable Object for counters? (DO is precise but pricier; KV is
  eventually consistent.)
- Window granularity: per-second / per-minute / per-day windows simultaneously?
- How to handle bursts (token bucket capacity)?

## Phase 4 — Premium Tiers (Planned)

**Goal:** Monetize the hosted deployment by offering plans that unlock the
limits introduced in Phase 3. Self-hosted users keep full functionality
without licensing.

### Tiers (proposed — to validate)

| Tier | Max file | Max TTL | Storage | Uploads/day | Price/mo |
|------|----------|---------|---------|-------------|----------|
| Free | 25 MB | 1 h | 500 MB | 50 | $0 |
| Pro | 100 MB | 24 h | 10 GB | 1,000 | $5 |
| Team | 500 MB | 7 days | 100 GB | 10,000 | $20 |
| Custom | negotiated | negotiated | negotiated | negotiated | contact |

(Numbers are placeholders — finalize after Phase 3 data on real usage.)

### Work items

- [ ] **D1 schema**: `plans` table (tier definitions) + `users.plan_id`
- [ ] **Billing integration** — pick provider (Stripe / Polar / SePay / Paddle)
      based on geography & tax-handling needs
- [ ] **Checkout flow** — dashboard upgrade button → hosted checkout
- [ ] **Webhook handler** — provision/downgrade plan on subscription events
- [ ] **Trial period** for Pro (e.g., 7 days)
- [ ] **Grace period** on payment failure before downgrade
- [ ] **Invoice / receipt** access from dashboard
- [ ] **Plan downgrade UX** — what happens to files exceeding new limits?
      (read-only, soft-delete on TTL expiry, force user to clean up?)
- [ ] **Annual discount** option
- [ ] **Team seats** model for the Team tier (shared quota vs. per-seat)
- [ ] **Public pricing page** at `/pricing`

### Open questions

- Self-hosters vs. hosted users — same code path, gated by env flag?
- Refund policy?
- TTL extension / "pin" feature as an a-la-carte add-on?
- Separate API access tier (high RPS) for enterprise integrations?

## Phase 5 — Future Ideas (Backlog)

- Folder/project namespacing for keys
- Webhook on upload (notify external system)
- Signed-URL mode (private files, time-limited tokens)
- Direct S3-compatible API surface
- MCP server wrapper around the CLI
- Audit log for dashboard actions (key revoked by, IP, UA)
- 2FA / passkeys for dashboard
- Org accounts (multiple users share a billing account)
