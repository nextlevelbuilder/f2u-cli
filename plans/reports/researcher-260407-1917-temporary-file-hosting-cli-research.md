# Research Report: Temporary File Hosting CLI with Auto-Expiry

## 1. Existing Solutions & Patterns

### Competitors & Reference Implementations

| Service | TTL Pattern | Strengths | Weaknesses |
|---------|-------------|-----------|-----------|
| **0x0.st** | 30 days–1 year (size-based) | Simple, unlimited downloads, manual token-based deletion available | Limited file size (512MiB max), no streaming progress |
| **file.io** | Single download expiry (configurable) | One-time access inherent security | Overly restrictive for file distribution use case |
| **transfer.sh** | Implied longer retention | Established, widely used | Documentation sparse on TTL mechanics |

**Key insight:** Size-based TTL (0x0.st model) more practical than download-based. Smaller files keep longer → better UX for distributed links.

### R2 Native Auto-Expiry Capabilities

Cloudflare R2 offers **Object Lifecycle Management** natively:
- Define up to 1,000 lifecycle rules per bucket
- Auto-delete objects after N days
- Abort incomplete multipart uploads (default: 7 days)
- Removal happens within ~24 hours of expiration trigger

**Recommendation:** Use R2 lifecycle rules for automatic cleanup. No custom cleanup Worker needed if expiry metadata stored in object tags or database.

---

## 2. Architecture Pattern Recommendation

### Recommended: Hybrid (Presigned URL + D1 Tracking)

```
┌─────────────────┐
│   CLI (Node.js) │
│   • File input  │
│   • Config mgmt │
└────────┬────────┘
         │
         ├──→ Fetch presigned URL from Worker
         │    (POST /sign-upload)
         │
         └──→ Direct PUT to R2 with presigned URL
              (bypasses Worker bandwidth)
              + Stream progress tracking (ora spinner)
              
Worker stores in D1:
├─ file_id, bucket_path, expiry_time
├─ file_hash (for dedup)
└─ download_count (optional)

Cron Worker (daily):
└─ Delete from R2 where expiry_time < now()
   + Prune D1 records
```

### Why This Architecture

**Presigned URL approach over direct Worker upload:**

| Dimension | Presigned URL | Direct Worker Upload |
|-----------|---------------|---------------------|
| **Bandwidth** | Free (bypasses Worker) | Charges per GB |
| **Latency** | Fast (direct R2) | Slower (Worker proxy) |
| **Validation** | Server-side pre-upload | Server-side post-upload |
| **File size limit** | 5GB (R2 limit) | 100MB (Worker limit)* |
| **Complexity** | Moderate (signature generation) | Low |

*Workers have CPU/memory constraints; presigned URLs offload to R2.

**Presigned URL + D1 tracking advantage:**
- R2 lifecycle rules handle auto-delete (no custom Worker needed)
- D1 acts as source-of-truth for CLI: which files you uploaded, when they expire
- Optional: Use D1 to track download counts, generate shareable link metadata
- Clean separation: R2 handles storage, D1 handles metadata

**Not recommended: Full Worker upload proxy** — wastes Worker execution time & bandwidth for simple passthrough.

---

## 3. CLI Authentication Pattern

### Config File Location & Design

**Primary location:** `~/.config/f2u/config.json` (XDG-compliant)
- Fallback: `~/.f2u-config.json` for simplicity if XDG too opinionated
- macOS can also check `~/Library/Application Support/f2u/`

**File structure (example):**
```json
{
  "cloudflare": {
    "accountId": "xxxx",
    "apiToken": "v1.0_xxx_yyy",
    "workerUrl": "https://f2u.example.com"
  },
  "defaults": {
    "ttl": 7,
    "isPublic": true
  }
}
```

**File permissions:** `0600` (user read/write only) — enforce in CLI.

### Credential Hierarchy (in order of precedence)

1. **Environment variables** (override everything)
   - `F2U_API_TOKEN`
   - `F2U_ACCOUNT_ID`
   - `F2U_WORKER_URL`

2. **Config file** (`~/.config/f2u/config.json`)
   - Only load if readable by owner (chmod check)
   - Warn if world-readable (security anti-pattern)

3. **Interactive prompt** (fallback)
   - Ask user to save credentials to config file

**API Token best practice:**
- Use Cloudflare **API Tokens** (not legacy API Keys)
- Scope token to: `R2 → All R2 buckets → Upload object only`
- Prevent accidental over-provisioning

**Security guardrails in CLI:**
- Never log or echo credentials
- Mask config file content in debug output
- Validate file permissions on load (warn if `0644` or wider)
- Support environment variables to avoid config files in CI/CD

---

## 4. NPM Package Structure

### Recommended Setup

**Language:** TypeScript (not JavaScript)
- Strict tsconfig (disallow implicit any, strict null checks)
- Compile to ESM-only (drop CommonJS)
- Output: `dist/` folder with `.d.ts` files

**Minimal Dependency Footprint:**

```json
{
  "dependencies": {
    "@aws-sdk/client-s3": "^3.x",
    "commander": "^12.x",
    "chalk": "^6.x",
    "ora": "^8.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "@types/node": "^20.x",
    "vitest": "^1.x",
    "tsx": "^4.x"
  }
}
```

**Rationale:**
- `@aws-sdk/client-s3` (not full AWS SDK): S3-compatible, modular, no dependencies
- `commander`: Industry standard for CLI argument parsing (battle-tested)
- `chalk`: Color terminal output (ESM, fully typed)
- `ora`: Progress spinners (standard in 2026 CLI tooling)
- No `inquirer` (yet) — YAGNI, add if interactive config flow needed later

**Total production dependencies: 4** (strict minimalism).

### File Structure

```
f2u-cli/
├── src/
│   ├── cli.ts              # Command entry point
│   ├── commands/
│   │   ├── upload.ts
│   │   ├── list.ts
│   │   └── delete.ts
│   ├── services/
│   │   ├── r2-client.ts    # S3 client wrapper
│   │   ├── auth.ts         # Config file & env var handling
│   │   └── progress.ts     # Upload progress tracking
│   └── types.ts            # Shared TypeScript interfaces
├── dist/                   # Compiled JS + .d.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

**Keep each file <150 lines.** Split if approaching 200.

### Build & Test Commands

```json
{
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest",
    "dev": "tsx src/cli.ts",
    "lint": "tsc --noEmit && node scripts/check-format.js"
  }
}
```

**Note:** No heavy linting (eslint/prettier) — TypeScript strict mode + Vitest is enough.

---

## 5. Key Implementation Details

### Upload Flow (CLI → Presigned URL → R2)

```typescript
// Pseudocode
1. Load credentials from config/env
2. Call Worker: POST /sign-upload
   Body: { fileName, fileSize, ttl: 7 }
   Returns: { uploadUrl, fileId, expiresAt }
3. Stream file to uploadUrl with PUT request
   - Pipe fs.createReadStream() to HTTP PUT
   - Track bytes transferred for ora spinner
4. Worker response: { success: true, downloadUrl, ... }
5. CLI outputs: "Download link: https://..."
6. Save entry in D1 (via Worker API): fileId, expiry, download count
```

### Progress Bar Implementation

Use `ora` spinner for upload progress:
```typescript
const spinner = ora('Uploading file...').start();

// Update spinner text with progress
spinner.text = `Uploading file... [${percent}%]`;

// On completion
spinner.succeed(`Uploaded! Link: ${downloadUrl}`);
```

For large files, track **bytes sent** vs **total file size** from fs.stat().

### Cron Worker Cleanup (D1 + R2)

```typescript
// wrangler.toml
[env.production]
triggers = { crons = ["0 2 * * *"] }  # Daily at 2am UTC

// Worker handler
export default {
  async scheduled(event, env, ctx) {
    const db = env.DB;
    
    // Find expired files
    const expired = await db
      .prepare("SELECT file_path FROM uploads WHERE expiry_time < ?")
      .bind(new Date())
      .all();
    
    // Delete from R2
    for (const file of expired.results) {
      await env.BUCKET.delete(file.file_path);
    }
    
    // Clean D1
    await db
      .prepare("DELETE FROM uploads WHERE expiry_time < ?")
      .bind(new Date())
      .run();
  }
};
```

---

## 6. Trade-offs & Risk Assessment

### Adoption Risk: LOW

| Risk | Mitigation |
|------|-----------|
| **Cloudflare vendor lock-in** | R2 is S3-compatible; migration possible (painful but feasible). Use standard SDK. |
| **D1 cold starts** | Cron runs at fixed time (2am); not user-facing. Acceptable latency. |
| **Large file uploads** | Presigned URL + streaming handles up to 5GB (R2 limit). No chunking needed for v1. |
| **Credentials exposure** | Config file permissions enforced. Env vars optional. Rotate tokens regularly (Cloudflare dashboard). |

### Maturity & Community

- **AWS SDK v3 Client-S3**: Mature, widely used (enterprise-grade)
- **Commander.js**: Battle-tested in thousands of CLIs (>15 years stable)
- **Cloudflare Workers + Cron Triggers**: GA since 2023, production-ready
- **R2 Lifecycle Rules**: GA, reliable

**No experimental/bleeding-edge dependencies.**

---

## 7. Actionable Recommendations (Ranked)

### Tier 1: Build Architecture (MUST)

1. **Use presigned URL approach** for upload (not full Worker proxy)
   - Saves bandwidth, reduces latency, scales to 5GB files
   - Worker only generates URL + stores metadata in D1

2. **Implement R2 lifecycle rules** for auto-expiry
   - No custom cleanup Worker logic needed
   - Set default rule: delete objects after 30 days
   - Allow per-file override via query params

3. **Store metadata in D1** alongside R2
   - Track file_id, expiry_time, upload_user, download_count
   - Enables future features (list uploads, analytics, undo delete)

### Tier 2: CLI Implementation (SHOULD)

4. **TypeScript + ESM-only** codebase
   - Stricter during development, smaller output
   - Target Node 18+

5. **Config file + env var hierarchy** for credentials
   - Primary: `~/.config/f2u/config.json` (XDG-compliant)
   - Fallback: environment variables
   - Enforce 0600 permissions, warn if world-readable

6. **Minimal dependencies** (4 production packages max)
   - Commander, Chalk, Ora, AWS SDK v3 client-s3
   - No Inquirer (yet), no Express, no heavy frameworks

### Tier 3: Polish (NICE-TO-HAVE)

7. **Interactive config setup** (use Inquirer later if needed)
   - `f2u auth` command to store credentials

8. **Upload progress bar** with ora spinner
   - Show byte count + percentage

9. **Shareable file list** API
   - `f2u list` to retrieve uploads from D1

---

## 8. Unresolved Questions

1. **Should CLI support multiple upload profiles?** (different Cloudflare accounts)
   - Defer to v2 unless core blocker

2. **Download counting:** Track in D1 or via Worker middleware?
   - D1 if analytics important; skip if not

3. **File encryption:** Store plaintext in R2 or encrypt at rest?
   - R2 HTTPS + Cloudflare encryption sufficient for v1

4. **CLI release strategy:** npm registry or private registry?
   - Assume public npm for this research

5. **Node version minimum:** 18, 20, or 22?
   - Recommend 18 (wide support), test on 20+

---

## Sources

- [Object Lifecycle Management · Cloudflare R2 docs](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)
- [Presigned URLs · Cloudflare R2 docs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [AWS SDK v3 Client-S3 · Cloudflare R2 docs](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/)
- [Cron Triggers · Cloudflare Workers docs](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Authentication · Cloudflare R2 docs](https://developers.cloudflare.com/r2/api/tokens/)
- [How I Build an npm Package in 2026 | Medium](https://medium.com/@pyyupsk/how-i-build-an-npm-package-in-2026-4bb1a4b88e11)
- [The Complete Guide to Building Developer CLI Tools in 2026 - DEV Community](https://dev.to/chengyixu/the-complete-guide-to-building-developer-cli-tools-in-2026-a96)
- [The Definitive Guide to Commander.js | Better Stack Community](https://betterstack.com/community/guides/scaling-nodejs/commander-explained/)
- [Uploading to Cloudflare R2 with AWS SDK for JavaScript - Blog](https://blog.prakashravi.com/uploading-files-to-cloudflare-r2-with-aws-sdk-for-javascript-v3)
- [Building Cloudflare R2 Pre-signed URL Uploads with Hono - Liran Tal](https://lirantal.com/blog/cloudflare-r2-presigned-url-uploads-hono)
