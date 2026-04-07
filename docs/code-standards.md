# Code Standards

## TypeScript

- Strict mode enabled (`strict: true`)
- Target: ES2022
- Module: ESNext with bundler resolution
- No `any` types — use proper interfaces

## File Naming

- kebab-case for all TypeScript files: `upload-route.ts`, `auth-middleware.ts`
- Descriptive names that indicate purpose: `cleanup-expired-files.ts`

## CLI Output Convention

- **All stdout is JSON** — no human-readable formatting, no tables, no colors
- Errors written to stderr as JSON: `{"error": "message"}`
- Non-zero exit code on errors
- Single JSON object per line (NDJSON-compatible)

## Error Handling

### Worker
- Try/catch around R2 and D1 operations
- Return JSON error responses with appropriate HTTP status codes
- Log errors with `console.error` for Worker logs
- Best-effort cleanup on partial failures (e.g., delete R2 object if D1 insert fails)

### CLI
- Validate inputs before API calls (file exists, TTL valid)
- Parse API error responses and forward as JSON to stderr
- `process.exit(1)` on any error

## API Response Format

Success responses:
```json
{"id": "...", "url": "...", "filename": "...", "expires_at": "..."}
```

Error responses:
```json
{"error": "Human-readable error message"}
```

## Dependencies

- Minimal dependencies — only add what's strictly needed
- Worker: `hono` only
- CLI: `commander` only
- Dev deps: TypeScript tooling (`tsup`, `tsx`, `wrangler`, types)
