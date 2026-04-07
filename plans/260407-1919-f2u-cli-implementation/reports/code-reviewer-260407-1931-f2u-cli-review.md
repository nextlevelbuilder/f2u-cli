# Code Review: f2u-cli Implementation

**Reviewer:** code-reviewer | **Date:** 2026-04-07  
**Scope:** Full implementation — Worker (Hono/CF) + CLI (Commander.js)  
**Files reviewed:** 14 files across packages/worker and packages/cli

---

## Overall Assessment

Solid first implementation. Clean separation of concerns, good error handling patterns, proper config file permissions (0o600). Several issues need attention before production — two critical security findings and multiple API contract mismatches that will cause runtime failures.

---

## Critical Issues

### C1. Content-Disposition Header Injection (serve-route.ts:58)

```ts
'Content-Disposition': `inline; filename="${record.filename}"`
```

`record.filename` comes from the original upload (`file.name`) and is stored in D1 without sanitization. A malicious filename containing `"` or newlines allows **header injection**. An attacker could craft a filename like `evil"\r\nX-Injected: true` to inject arbitrary headers.

**Fix:** Sanitize or encode the filename per RFC 6266:
```ts
'Content-Disposition': `inline; filename="${record.filename.replace(/["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(record.filename)}`
```

### C2. Timing-Safe Token Comparison Missing (auth-middleware.ts:14)

```ts
if (token !== c.env.API_KEY) {
```

String `!==` enables timing attacks. While practical exploitability on Workers is low due to network jitter, this is a well-known security anti-pattern for API key validation.

**Fix:** Use a constant-time comparison:
```ts
import { timingSafeEqual } from 'node:crypto'; // or use subtle.timingSafeEqual in Workers
const encoder = new TextEncoder();
const a = encoder.encode(token);
const b = encoder.encode(c.env.API_KEY);
if (a.byteLength !== b.byteLength || !crypto.subtle.timingSafeEqual(a, b)) {
```
Note: `crypto.subtle.timingSafeEqual` is available in Workers runtime. For different-length keys, hash both first or pad to equal length.

### C3. No File Size Limit on Upload (upload-route.ts)

There is **no size validation** before calling `file.arrayBuffer()`. A malicious or buggy client can upload arbitrarily large files, exhausting Worker memory (128MB limit). This will crash the Worker.

**Fix:** Add size check before `arrayBuffer()`:
```ts
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB or whatever limit
if (file.size > MAX_FILE_SIZE) {
  return c.json({ error: `File too large. Maximum: ${MAX_FILE_SIZE} bytes` }, 413);
}
```

---

## High Priority

### H1. API Contract Mismatches — CLI Types vs Worker Responses

Multiple CLI interface types don't match what the Worker actually returns. These will cause silent data loss (missing fields) or runtime errors:

| CLI Type | CLI Field | Worker Actually Returns |
|----------|-----------|------------------------|
| `FileInfo` | `ttl_remaining_seconds` | `ttl_remaining` |
| `DeleteResult` | `success: boolean` | `{ id, deleted: true }` — no `success` field |
| `UsageResult` | `{ file_count, total_size_bytes, total_size_human }` | `{ active: { count, bytes }, all_time: { count, bytes } }` — completely different shape |
| `listFiles()` return | `FileInfo[]` | `{ files: FileInfo[], count: number }` — wrapped in object |

The `listFiles` one is a **runtime bug**: `handleResponse<FileInfo[]>` will succeed but the caller gets a `{ files, count }` object pretending to be an array. Any `.map()` or `.length` on it will fail.

**Fix:** Align CLI types to match actual Worker responses exactly.

### H2. CORS Wildcard on All Routes (index.ts:14)

```ts
app.use('*', cors());
```

This allows **any origin** to call protected endpoints (upload, delete, etc.) with Bearer tokens. If a browser tab has the token (e.g., from a web-based agent), any malicious page can make cross-origin requests.

For a CLI-only tool this is low risk, but if any web UI is added it becomes a credential theft vector.

**Fix:** Either restrict origins or remove CORS entirely (CLI doesn't need it):
```ts
app.use('*', cors({ origin: ['https://your-admin.example.com'] }));
```

### H3. Duplicate Delete Logic (index.ts:35-64 vs files-route.ts:68-112)

The DELETE `/:id` handler is implemented **twice** — once inline in index.ts and once in files-route.ts. The inline version exists because of route ordering with the serve route, but now there are two copies that can drift. The inline one also uses `import('./types').FileRecord` inline imports which is a code smell.

**Fix:** Extract shared delete logic into a service function and call it from both places, or restructure routing so only one handler exists.

---

## Medium Priority

### M1. Cron Runs Every Minute (wrangler.toml:6)

```toml
crons = ["* * * * *"]
```

Running cleanup every 60 seconds is aggressive. Each invocation hits D1 even when there's nothing to clean. With only 50 records per run, a backlog of expired files will take many minutes to clear.

**Suggestion:** `*/5 * * * *` (every 5 min) is sufficient for temp file hosting. Increase batch size to 200.

### M2. readFileSync in CLI Upload (api-client.ts:65)

```ts
const fileBuffer = readFileSync(filePath);
```

Reads entire file into memory synchronously. For large files this blocks the event loop and doubles memory usage (buffer + Blob). Won't matter for small files but the tool has no size limit.

**Suggestion:** Use `createReadStream` or at minimum add a size check before reading.

### M3. No Pagination on /files Endpoint

The `/files` endpoint has `LIMIT 100` hardcoded with no cursor/offset parameter. Users with many files cannot retrieve beyond the first 100.

### M4. Missing Index for Cleanup Query Performance

The cleanup query filters on `deleted = 0 AND expires_at <= ?`. The schema has separate indexes on `deleted` and `expires_at` but no composite index. D1/SQLite can only use one index per table scan.

**Fix:** Add composite index:
```sql
CREATE INDEX IF NOT EXISTS idx_cleanup ON files(deleted, expires_at);
```

### M5. `process.exit(1)` in handleResponse (api-client.ts:59)

Calling `process.exit()` inside a library method is an anti-pattern — it makes the code untestable and prevents callers from handling errors gracefully. Should throw an error and let the command handler decide what to do.

---

## Low Priority

### L1. No Request ID / Trace Correlation

Worker errors log to console but there's no request ID. When debugging production issues, correlating a user's error to a specific log entry is impossible.

### L2. Filename Not Validated in URL Path

`upload-route.ts:44`: `const r2Key = \`${id}/${filename}\``

The filename is used directly in the R2 key. While R2 keys are binary-safe, filenames with `/` would create unexpected key hierarchies. Worth sanitizing.

### L3. `handleResponse` Exits Process on 4xx

Non-fatal errors like 404 (file not found) or 410 (expired) cause `process.exit(1)`. For AI agents consuming JSON output, a structured error response on stdout (not stderr + exit) would be more usable.

---

## Positive Observations

- Clean monorepo structure with clear separation
- Config file gets `chmod 0o600` — good security practice
- Env var fallback for config (F2U_ENDPOINT, F2U_API_KEY) — good for CI/CD
- TTL validation on both client and server
- Best-effort R2 cleanup on D1 insert failure
- Proper use of parameterized SQL queries (no injection risk)
- Expired file check on serve — can't access files past TTL
- JSON-only output from CLI — designed for machine consumption

---

## Recommended Actions (Priority Order)

1. **[CRITICAL]** Sanitize filename in Content-Disposition header
2. **[CRITICAL]** Add file size limit to upload endpoint
3. **[HIGH]** Fix all CLI type definitions to match Worker response shapes
4. **[HIGH]** Extract duplicate delete logic into shared function
5. **[MEDIUM]** Add composite DB index for cleanup query
6. **[MEDIUM]** Refactor `handleResponse` to throw instead of `process.exit`
7. **[LOW]** Add timing-safe comparison for API key (low practical risk on Workers)
8. **[LOW]** Consider restricting CORS or removing it

---

## Unresolved Questions

1. Is there an intended max file size? Worker memory limit is 128MB but R2 supports multipart uploads up to 5GB — the current approach buffers everything in memory.
2. Should deleted/expired file records ever be purged from D1, or kept forever for audit?
3. Is the single API_KEY model sufficient, or will multi-tenant support be needed?
