# Phase 2: Worker API

## Overview
- **Priority**: P1
- **Status**: Pending
- **Effort**: 3h
- **Blocked by**: Phase 1

Implement all Worker routes using Hono. The Worker handles file upload to R2, serving files, deletion, listing, and usage stats. Auth via Bearer token.

## Context Links
- [Hono Cloudflare Workers docs](https://hono.dev/getting-started/cloudflare-workers)
- [R2 API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
- [D1 API](https://developers.cloudflare.com/d1/worker-api/)

## Requirements

- Bearer token auth middleware on all routes except `GET /:id/:filename`
- Multipart file upload with TTL parameter
- File serving with expiry check
- CRUD operations + usage stats
- All responses JSON (except file serve which returns file bytes)

## Architecture

```
Bindings (wrangler.toml):
  R2_BUCKET: f2u-files
  D1_DATABASE: f2u-db
  API_KEY: (secret)

Env type:
  { R2_BUCKET: R2Bucket, D1_DATABASE: D1Database, API_KEY: string }
```

## Implementation Steps

### 1. Types — `packages/worker/src/types.ts`

```typescript
export interface Env {
  R2_BUCKET: R2Bucket;
  D1_DATABASE: D1Database;
  API_KEY: string;
}

export interface FileRecord {
  id: string;
  filename: string;
  content_type: string | null;
  size: number;
  r2_key: string;
  url: string;
  ttl_seconds: number;
  expires_at: string;
  created_at: string;
  deleted: number;
}
```

### 2. Auth middleware — `packages/worker/src/middleware/auth.ts`

```typescript
import { createMiddleware } from 'hono/factory';
import type { Env } from '../types';

export const authMiddleware = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }
  const token = authHeader.slice(7);
  if (token !== c.env.API_KEY) {
    return c.json({ error: 'Invalid API key' }, 401);
  }
  await next();
});
```

### 3. Upload route — `packages/worker/src/routes/upload.ts`

```typescript
import { Hono } from 'hono';
import type { Env } from '../types';

const TTL_OPTIONS: Record<string, number> = {
  '5m': 300, '15m': 900, '30m': 1800,
  '1h': 3600, '6h': 21600, '12h': 43200, '24h': 86400,
};

const app = new Hono<{ Bindings: Env }>();

app.post('/upload', async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return c.json({ error: 'No file provided' }, 400);

  const ttlParam = (formData.get('ttl') as string) || '5m';
  const ttlSeconds = TTL_OPTIONS[ttlParam];
  if (!ttlSeconds) {
    return c.json({ error: `Invalid TTL. Options: ${Object.keys(TTL_OPTIONS).join(', ')}` }, 400);
  }

  const id = crypto.randomUUID();
  const r2Key = `${id}/${file.name}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  // Upload to R2
  await c.env.R2_BUCKET.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  // Record in D1
  const url = new URL(`/${id}/${encodeURIComponent(file.name)}`, c.req.url).toString();
  await c.env.D1_DATABASE.prepare(
    `INSERT INTO files (id, filename, content_type, size, r2_key, url, ttl_seconds, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, file.name, file.type || null, file.size, r2Key, url, ttlSeconds, expiresAt.toISOString()).run();

  return c.json({
    id,
    filename: file.name,
    url,
    size: file.size,
    content_type: file.type,
    ttl: ttlParam,
    ttl_seconds: ttlSeconds,
    expires_at: expiresAt.toISOString(),
    created_at: now.toISOString(),
  }, 201);
});

export default app;
```

### 4. Serve route — `packages/worker/src/routes/serve.ts`

```typescript
import { Hono } from 'hono';
import type { Env, FileRecord } from '../types';

const app = new Hono<{ Bindings: Env }>();

// No auth — public access
app.get('/:id/:filename', async (c) => {
  const { id, filename } = c.req.param();

  const record = await c.env.D1_DATABASE.prepare(
    'SELECT * FROM files WHERE id = ?'
  ).bind(id).first<FileRecord>();

  if (!record || record.deleted) {
    return c.json({ error: 'File not found' }, 404);
  }

  if (new Date(record.expires_at) < new Date()) {
    return c.json({ error: 'File expired' }, 410);
  }

  const object = await c.env.R2_BUCKET.get(record.r2_key);
  if (!object) {
    return c.json({ error: 'File not found in storage' }, 404);
  }

  const headers = new Headers();
  headers.set('Content-Type', record.content_type || 'application/octet-stream');
  headers.set('Content-Length', record.size.toString());
  headers.set('Cache-Control', 'public, max-age=60');
  headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(record.filename)}"`);

  return new Response(object.body, { headers });
});

export default app;
```

### 5. Files/Delete routes — `packages/worker/src/routes/files.ts`

```typescript
import { Hono } from 'hono';
import type { Env, FileRecord } from '../types';

const app = new Hono<{ Bindings: Env }>();

// List active files
app.get('/files', async (c) => {
  const { results } = await c.env.D1_DATABASE.prepare(
    `SELECT id, filename, content_type, size, url, ttl_seconds, expires_at, created_at
     FROM files WHERE deleted = 0 AND expires_at > datetime('now')
     ORDER BY created_at DESC LIMIT 100`
  ).all<FileRecord>();

  return c.json({ files: results || [], count: results?.length || 0 });
});

// Delete file
app.delete('/:id', async (c) => {
  const { id } = c.req.param();

  const record = await c.env.D1_DATABASE.prepare(
    'SELECT * FROM files WHERE id = ? AND deleted = 0'
  ).bind(id).first<FileRecord>();

  if (!record) {
    return c.json({ error: 'File not found' }, 404);
  }

  await c.env.R2_BUCKET.delete(record.r2_key);
  await c.env.D1_DATABASE.prepare(
    'UPDATE files SET deleted = 1 WHERE id = ?'
  ).bind(id).run();

  return c.json({ id, deleted: true });
});

// File info
app.get('/info/:id', async (c) => {
  const { id } = c.req.param();

  const record = await c.env.D1_DATABASE.prepare(
    'SELECT * FROM files WHERE id = ?'
  ).bind(id).first<FileRecord>();

  if (!record) {
    return c.json({ error: 'File not found' }, 404);
  }

  const now = new Date();
  const expiresAt = new Date(record.expires_at);
  const ttlRemaining = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
  const expired = record.deleted === 1 || expiresAt < now;

  return c.json({
    id: record.id,
    filename: record.filename,
    content_type: record.content_type,
    size: record.size,
    url: record.url,
    ttl_seconds: record.ttl_seconds,
    ttl_remaining: ttlRemaining,
    expires_at: record.expires_at,
    created_at: record.created_at,
    expired,
    deleted: record.deleted === 1,
  });
});

export default app;
```

### 6. Usage route — `packages/worker/src/routes/usage.ts`

```typescript
import { Hono } from 'hono';
import type { Env } from '../types';

const app = new Hono<{ Bindings: Env }>();

app.get('/usage', async (c) => {
  const active = await c.env.D1_DATABASE.prepare(
    `SELECT COUNT(*) as count, COALESCE(SUM(size), 0) as total_size
     FROM files WHERE deleted = 0 AND expires_at > datetime('now')`
  ).first<{ count: number; total_size: number }>();

  const allTime = await c.env.D1_DATABASE.prepare(
    'SELECT COUNT(*) as count, COALESCE(SUM(size), 0) as total_size FROM files'
  ).first<{ count: number; total_size: number }>();

  return c.json({
    active: {
      files: active?.count || 0,
      bytes: active?.total_size || 0,
    },
    all_time: {
      files: allTime?.count || 0,
      bytes: allTime?.total_size || 0,
    },
  });
});

export default app;
```

### 7. Main entry — `packages/worker/src/index.ts`

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import { authMiddleware } from './middleware/auth';
import uploadRoutes from './routes/upload';
import serveRoutes from './routes/serve';
import filesRoutes from './routes/files';
import usageRoutes from './routes/usage';
import { cleanupExpiredFiles } from './cron/cleanup';

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());

// Public routes (no auth)
app.route('/', serveRoutes);

// Protected routes
app.use('/upload', authMiddleware);
app.use('/files', authMiddleware);
app.use('/info/*', authMiddleware);
app.use('/usage', authMiddleware);
app.use('/:id', authMiddleware); // DELETE /:id

app.route('/', uploadRoutes);
app.route('/', filesRoutes);
app.route('/', usageRoutes);

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(cleanupExpiredFiles(env));
  },
};
```

**Note on route ordering**: The serve route (`/:id/:filename`) must not conflict with other routes. Hono matches in registration order, so specific routes (`/upload`, `/files`, `/usage`, `/health`) registered after serve won't conflict because serve expects TWO path segments (`/:id/:filename`), while the others have ONE. The `DELETE /:id` route is the only potential conflict — but it uses a different HTTP method (DELETE vs GET), so no issue.

## Todo

- [ ] Create `types.ts` with Env and FileRecord interfaces
- [ ] Create auth middleware
- [ ] Implement POST /upload route
- [ ] Implement GET /:id/:filename serve route
- [ ] Implement GET /files list route
- [ ] Implement DELETE /:id route
- [ ] Implement GET /info/:id route
- [ ] Implement GET /usage route
- [ ] Wire all routes in index.ts with proper auth middleware
- [ ] Add health check endpoint
- [ ] Verify TypeScript compiles with no errors

## Success Criteria

- All routes type-check with `tsc --noEmit`
- `wrangler dev` starts without errors
- POST /upload accepts multipart form data and returns JSON with URL
- GET /:id/:filename returns file with correct Content-Type
- GET routes return proper JSON
- DELETE marks file as deleted and removes from R2
- 401 returned for missing/invalid Bearer token on protected routes
