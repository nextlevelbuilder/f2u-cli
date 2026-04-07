import { Hono } from 'hono';
import type { Env, FileRecord } from '../types';

const filesRoute = new Hono<{ Bindings: Env }>();

// GET /files — list active (non-expired, non-deleted) files, limit 100
filesRoute.get('/files', async (c) => {
  try {
    const now = new Date().toISOString();
    const result = await c.env.D1_DATABASE.prepare(
      `SELECT * FROM files
       WHERE deleted = 0 AND expires_at > ?
       ORDER BY created_at DESC
       LIMIT 100`,
    )
      .bind(now)
      .all<FileRecord>();

    return c.json({ files: result.results, count: result.results.length });
  } catch (err) {
    console.error('D1 list error:', err);
    return c.json({ error: 'Failed to list files' }, 500);
  }
});

// GET /info/:id — file details with ttl_remaining
filesRoute.get('/info/:id', async (c) => {
  const { id } = c.req.param();

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

  const now = new Date();
  const expiresAt = new Date(record.expires_at);
  const ttlRemaining = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
  const expired = now > expiresAt;

  return c.json({
    id: record.id,
    filename: record.filename,
    url: record.url,
    size: record.size,
    content_type: record.content_type,
    ttl_seconds: record.ttl_seconds,
    ttl_remaining: ttlRemaining,
    expires_at: record.expires_at,
    created_at: record.created_at,
    deleted: record.deleted === 1,
    expired,
  });
});

export default filesRoute;
