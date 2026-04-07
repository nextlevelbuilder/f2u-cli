import { Hono } from 'hono';
import type { Env, FileRecord } from '../types';

// Public file serving — no auth required
const serveRoute = new Hono<{ Bindings: Env }>();

serveRoute.get('/:id/:filename', async (c) => {
  const { id } = c.req.param();

  // Look up file record in D1
  let record: FileRecord | null;
  try {
    const result = await c.env.D1_DATABASE.prepare(
      'SELECT * FROM files WHERE id = ? LIMIT 1',
    )
      .bind(id)
      .first<FileRecord>();
    record = result ?? null;
  } catch (err) {
    console.error('D1 query error:', err);
    return c.json({ error: 'Failed to retrieve file metadata' }, 500);
  }

  if (!record) {
    return c.json({ error: 'File not found' }, 404);
  }

  if (record.deleted === 1) {
    return c.json({ error: 'File has been deleted' }, 410);
  }

  const now = new Date();
  const expiresAt = new Date(record.expires_at);
  if (now > expiresAt) {
    return c.json({ error: 'File has expired' }, 410);
  }

  // Stream from R2
  let object: R2ObjectBody | null;
  try {
    object = await c.env.R2_BUCKET.get(record.r2_key);
  } catch (err) {
    console.error('R2 get error:', err);
    return c.json({ error: 'Failed to retrieve file from storage' }, 500);
  }

  if (!object) {
    return c.json({ error: 'File not found in storage' }, 404);
  }

  const contentType = record.content_type ?? 'application/octet-stream';

  return new Response(object.body, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(record.size),
      'Cache-Control': 'public, max-age=60',
      'Content-Disposition': `inline; filename="${record.filename.replace(/["\r\n\\]/g, '_')}"`,
    },
  });
});

export default serveRoute;
