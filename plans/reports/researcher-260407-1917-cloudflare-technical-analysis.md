# Cloudflare Technical Analysis for f2u-cli
**Date:** 2026-04-07 | **Status:** Complete

---

## 1. Cloudflare R2 API

### File Upload Methods
- **S3 API Compatible:** Use AWS SDK (`@aws-sdk/client-s3`) for multipart & standard uploads
  - Supports up to 5 GB files per object
  - No additional cost beyond standard R2 pricing
  - Full AWS S3 compatibility for PUT, POST, GET operations
  
- **Presigned URLs (Recommended for Client-Side):** 
  - Server generates presigned PUT URL for time-limited access
  - Client uploads directly without credentials exposure
  - Format: `https://{account-id}.r2.cloudflarestorage.com/{bucket}/{key}?X-Amz-Algorithm=...`
  - TTL configurable (commonly 15-60 minutes)
  
- **Workers Binding (Server-Side):**
  - Fastest method (no external network)
  - Access via `env.BUCKET_NAME.put(key, body)`
  - Free egress between Worker and R2

### Rate Limits & Quotas
- **File Size:** 5 GB maximum per object
- **Rate Limits:** Variable; r2.dev subdomain throttles after hundreds of req/s → **use custom domain for production**
- **Responses:** 429 Too Many Requests when throttled
- **Multipart Default:** Uploads expire after 7 days if not completed

### Object Lifecycle & Deletion
- **Lifecycle Rules:** Available via S3 API or Cloudflare dashboard
  - `putBucketLifecycleConfiguration()` with `Expiration` field (days)
  - Max 1000 rules per bucket
  - Objects deleted within 24 hours of expiration
  
- **Direct API Deletion:** 
  - `deleteObject()` for immediate removal
  - Instant (no delay)
  - Supports batch deletion via multipart API

### Public Bucket Access
- **Public (No Auth):** Objects accessible via `https://bucket-name.s3.us-east-1.r2.cloudflarestorage.com/key` (r2.dev domain)
- **Private (Auth Required):** Default; requires AWS signature headers
- **Rate Limit Issue:** r2.dev has variable throttling → **not production-ready**

---

## 2. Cloudflare R2 Custom Domains & Caching

### Custom Domain Setup
1. Create bucket in Cloudflare dashboard
2. Add custom domain CNAME record: `f2u.goclaw.sh → bucket-name.r2.cloudflarestorage.com`
3. Public access enabled for all objects

### Custom Domain vs. Presigned URLs
| Aspect | Presigned URLs | Custom Domain |
|--------|---|---|
| **Endpoint Format** | S3 domain only | Your custom domain |
| **Auth** | Time-limited token in URL | None (fully public) |
| **Access Control** | High security, bearer token | No built-in control |
| **Solution for Auth** | Use Workers proxy + HMAC validation (Pro+) or Workers auth layer |

### Recommended Pattern: Workers Proxy
**Problem:** Presigned URLs don't work with custom domains directly.
**Solution:** Route custom domain through Worker, which:
1. Validates request (e.g., auth token, referer, IP)
2. Fetches from R2 (free egress within CF network)
3. Returns cached response

**Cache Configuration:**
```javascript
// In Worker handler
response.headers.set('Cache-Control', 'public, max-age=3600');
// Must use custom domain route for caching (not *.workers.dev)
```

**Key:** Custom domain route → Worker → R2 enables Cloudflare cache layer.

---

## 3. Cloudflare D1 Database API

### Query Access Methods

**Option A: Workers Binding (Recommended)**
- Configured in wrangler.toml
- Zero-latency access from Worker
- No external network call
- Example: `env.DB.prepare("SELECT * FROM users").all()`

**Option B: REST API (Admin Only)**
- Endpoint: `https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/d1/database/{DATABASE_ID}/query`
- Requires Cloudflare API token with D1 write permission
- Rate-limited by Cloudflare global API limits (~1200 req/min per account)
- Use case: bulk imports, maintenance scripts, external tools

**Option C: Custom HTTP API via Worker**
- Create Worker that exposes HTTP endpoints (`POST /query`, `POST /insert`)
- Worker uses D1 binding internally
- Clients call Worker endpoint with auth (JWT, API key)
- Recommended for external CLI or third-party access

### D1 SQL Capabilities
- **SQLite Flavor:** Fully standards-compliant SQLite 3
- **Features:** Transactions, triggers, CTEs, JSON functions
- **Limitations:** No stored procedures (SQLite doesn't support)
- **Max Query Size:** 1 MB per request
- **Concurrent Connections:** No strict limit per se; D1 handles concurrency internally

### Data Import Pattern
- **Bulk Import API:** `POST /import` (REST API)
- **Workers Binding:** Insert via Worker script, batch via transaction
- **Best Practice:** Use transactions for bulk operations (atomic)

---

## 4. Cloudflare Workers Scheduled Tasks (Cron Triggers)

### Setup
```toml
# wrangler.toml
[[triggers.crons]]
cron = "0 * * * *"  # Every hour (UTC)
```

### Handler Implementation
```typescript
export default {
  async scheduled(event, env, ctx) {
    // Cleanup expired files
    const expired = await env.DB.prepare(
      "SELECT id, r2_key FROM uploads WHERE expires_at < datetime('now')"
    ).all();
    
    for (const record of expired.results) {
      await env.BUCKET.delete(record.r2_key);
      await env.DB.prepare("DELETE FROM uploads WHERE id = ?")
        .bind(record.id).run();
    }
  }
};
```

### Key Features
- **Execution:** UTC-based cron syntax (0-59 min, 0-23 hour, 1-31 day, 1-12 month, 0-6 dow)
- **Propagation:** 5-15 min to apply globally after deploy
- **Cost:** Free on all tiers
- **Reliability:** Best-effort; designed for non-critical periodic jobs
- **Timeout:** Worker timeout limit applies (10 sec free, 30 sec paid)
- **Monitoring:** Last 100 invocations visible in dashboard

### Cleanup Implementation
```typescript
// Cron handler for expired uploads
await env.BUCKET.delete(fileKey);  // No return value needed
await env.DB.prepare("DELETE FROM uploads WHERE id = ?").bind(id).run();
```

---

## 5. Wrangler Configuration

### R2 Binding
```toml
[[r2_buckets]]
binding = "BUCKET"
bucket_name = "f2u-uploads"
preview_bucket_name = "f2u-uploads-preview"  # Optional; for local dev
```

### D1 Binding
```toml
[[d1_databases]]
binding = "DB"
database_name = "f2u"
database_id = "your-db-id"  # Get from `wrangler d1 list`
```

### Workers Routes & Custom Domain
```toml
routes = [
  { pattern = "f2u.goclaw.sh/*", zone_id = "your-zone-id" }
]
```

### Auto-Provisioning
Wrangler can auto-create R2/D1 on first deploy:
```toml
[[r2_buckets]]
binding = "BUCKET"
# No bucket_name = Wrangler will create one
```

### Deploy
```bash
wrangler deploy  # Deploys Worker + applies bindings + cron triggers
```

---

## 6. CLI Design for AI Agents

### Essential Requirements
- **JSON Output Flag:** `--output json` (or `-o json`) mandatory
- **Machine-Readable Format:** NDJSON (newline-delimited JSON) preferred for streaming
- **No Color Codes:** Strip ANSI codes in structured output mode
- **Consistent Exit Codes:** 0=success, 1=error, 2=invalid args
- **Stdin Support:** Accept piped input for scripting

### Example Output Format
```bash
# Human output
$ f2u upload file.txt
✓ Uploaded to f2u.goclaw.sh/abc123

# Agent output
$ f2u upload file.txt --output json
{"status":"success","key":"abc123","url":"f2u.goclaw.sh/abc123","size":1024,"expires":"2026-04-14T19:17:00Z"}
```

### Node.js Framework Recommendations

| Framework | Size | DL/week | Best For | Notes |
|---|---|---|---|---|
| **commander** | 174 KB | 35M | Balanced, Git-style CLIs | Zero deps, ~20ms startup |
| **yargs** | Larger | 30M | Complex arg parsing | Rich validation, ~40ms startup |
| **sade** | 31.5 KB | - | Lightweight | Commander-like, minimal footprint |

**Recommendation for f2u-cli:** Use **Commander** (mature, TypeScript support, minimal deps).

### Sample CLI Structure
```typescript
import { Command } from 'commander';

const program = new Command();

program
  .command('upload <file>')
  .option('-o, --output <format>', 'output format', 'text')
  .action(async (file, opts) => {
    const key = await uploadToR2(file);
    
    if (opts.output === 'json') {
      console.log(JSON.stringify({ key, url: `https://f2u.goclaw.sh/${key}` }));
    } else {
      console.log(`✓ Uploaded to https://f2u.goclaw.sh/${key}`);
    }
  });

program.parse();
```

---

## 7. npm Global Install Patterns

### Modern Best Practice (2026)
```bash
# Users install CLI globally
npm install -g @nextlevelbuilder/f2u-cli

# CLI installed to user-owned bin directory (no sudo required)
# Symlinked to: ~/.npm/packages/bin/f2u
```

### package.json Configuration
```json
{
  "name": "@nextlevelbuilder/f2u-cli",
  "version": "1.0.0",
  "bin": {
    "f2u": "./dist/index.js"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "preferGlobal": true,
  "files": ["dist", "bin"]
}
```

### Shebang for Execution
```javascript
#!/usr/bin/env node
// dist/index.js starts here
```

### Distribution Strategy
1. **Build:** `tsc src/*.ts -d --outDir dist`
2. **Publish:** `npm publish` to npm registry
3. **Install:** Users run `npm install -g @nextlevelbuilder/f2u-cli`
4. **Invoke:** `f2u upload file.txt` (globally available)

### Security (2026)
- Never use `sudo npm install -g` (modern npm avoids permission issues)
- Verify package provenance if sensitive operations
- Consider npm signatures for distribution

---

## 8. Implementation Architecture Summary

### Data Flow
```
User CLI (f2u-cli)
  ↓
Commander argument parsing
  ↓
Cloudflare API calls (via @aws-sdk/client-s3 for R2)
  ↓
R2: PUT /bucket/key (presigned or direct auth)
D1: Worker proxy endpoint (POST /api/upload)
  ↓
Worker Handler
  ├─ Validates auth
  ├─ PUT to R2
  ├─ INSERT to D1 (metadata, TTL)
  ├─ Generate presigned download URL (if needed)
  └─ Return {key, url, expires}

Cleanup (Cron Trigger)
  ├─ Runs hourly
  ├─ Query D1 for expired records
  ├─ DELETE from R2
  └─ DELETE from D1
```

### Tech Stack Recommendation
- **CLI Framework:** Commander.js (TypeScript)
- **R2 Client:** @aws-sdk/client-s3 (S3-compatible)
- **D1 Access:** Custom Worker endpoint (HTTP API)
- **File Uploads:** Presigned URLs (client-side) or multipart (server-side)
- **Auth:** JWT or API key (passed in CLI via `--token` or env var)
- **Caching:** Worker proxy with `Cache-Control: public, max-age=3600`
- **Cleanup:** Cron trigger (hourly) + D1 lifecycle rules (optional backup)

---

## Unresolved Questions

1. **Upload Authentication:** Should CLI support API key auth, OAuth, or both? (Impacts token refresh logic)
2. **File Expiration:** Fixed TTL (e.g., 30 days) or user-configurable? (Affects D1 schema)
3. **Download URLs:** Generate presigned URLs or direct public URLs? (Security vs. simplicity trade-off)
4. **Batch Operations:** Support uploading multiple files in one CLI invocation? (Requires concurrency handling)
5. **Storage Tier:** Use R2 standard or intelligent-tiering for cost optimization? (Needs usage projection)

---

## Sources

### Cloudflare R2
- [Upload objects · Cloudflare R2 docs](https://developers.cloudflare.com/r2/objects/upload-objects/)
- [Presigned URLs · Cloudflare R2 docs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [Object lifecycles · Cloudflare R2 docs](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)
- [Limits · Cloudflare R2 docs](https://developers.cloudflare.com/r2/platform/limits/)
- [Introducing Object Lifecycle Management for Cloudflare R2](https://blog.cloudflare.com/introducing-object-lifecycle-management-for-cloudflare-r2/)

### Cloudflare D1
- [Build an API to access D1 using a proxy Worker · Cloudflare D1 docs](https://developers.cloudflare.com/d1/tutorials/build-an-api-to-access-d1/)
- [Bulk import to D1 using REST API · Cloudflare D1 docs](https://developers.cloudflare.com/d1/tutorials/import-to-d1-with-rest-api/)

### Cloudflare Workers
- [Cron Triggers · Cloudflare Workers docs](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Use R2 from Workers · Cloudflare R2 docs](https://developers.cloudflare.com/r2/api/workers/workers-api-usage/)
- [Bindings (env) · Cloudflare Workers docs](https://developers.cloudflare.com/workers/runtime-apis/bindings/)

### Wrangler
- [Configuration - Wrangler · Cloudflare Workers docs](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [How to Deploy Cloudflare Workers with Wrangler](https://oneuptime.com/blog/post/2026-01-28-deploy-cloudflare-workers-wrangler/view)

### CLI & Node.js
- [How to Build a CLI with Node.js: Commander vs yargs vs oclif — PkgPulse Blog](https://www.pkgpulse.com/blog/how-to-build-cli-nodejs-commander-yargs-oclif)
- [10 Must-have CLIs for your AI Agents in 2026 | by unicodeveloper | Apr, 2026 | Medium](https://medium.com/@unicodeveloper/10-must-have-clis-for-your-ai-agents-in-2026-51ba0d0881df)
- [Building a CLI That Works for Humans and Machines | openstatus](https://www.openstatus.dev/blog/building-cli-for-human-and-agents)
- [How to Understand Global vs Local npm Packages](https://oneuptime.com/blog/post/2026-01-22-nodejs-global-vs-local-packages/view)

### Custom Domains & Caching
- [GitHub - kotx/render: Cloudflare Worker to proxy and cache requests to R2](https://github.com/kotx/render)
- [Cloudflare Worker Proxy R2 Bucket Access - Lei Mao's Log Book](https://leimao.github.io/blog/Cloudflare-Worker-Proxy-R2-Bucket-Access/)

---

**Report Status:** Ready for implementation planning. All critical integration points documented with code examples and configuration templates provided.
