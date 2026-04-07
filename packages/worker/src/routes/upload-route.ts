import { Hono } from 'hono';
import type { Env } from '../types';

// Valid TTL labels mapped to seconds
const TTL_OPTIONS: Record<string, number> = {
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '6h': 21600,
  '12h': 43200,
  '24h': 86400,
};

const uploadRoute = new Hono<{ Bindings: Env }>();

uploadRoute.post('/upload', async (c) => {
  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ error: 'Invalid multipart form data' }, 400);
  }

  const fileEntry = formData.get('file');
  // FormDataEntryValue is string | File; Workers types expose File via Blob subtype
  if (!fileEntry || typeof fileEntry === 'string') {
    return c.json({ error: 'Missing or invalid "file" field' }, 400);
  }
  // At this point fileEntry is a Blob/File — Workers types use Blob, not File
  const file = fileEntry as unknown as { name: string; type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> };

  // Enforce 100MB upload limit (Workers memory constraint)
  const MAX_SIZE = 100 * 1024 * 1024; // 100MB
  if (file.size > MAX_SIZE) {
    return c.json({ error: `File too large. Maximum size is 100MB, got ${file.size} bytes` }, 413);
  }

  const ttlRaw = (formData.get('ttl') as string | null) ?? '5m';
  const ttlSeconds = TTL_OPTIONS[ttlRaw];
  if (ttlSeconds === undefined) {
    return c.json(
      { error: `Invalid TTL. Valid options: ${Object.keys(TTL_OPTIONS).join(', ')}` },
      400,
    );
  }

  const id = crypto.randomUUID();
  const filename = file.name || 'upload';
  const r2Key = `${id}/${filename}`;
  const contentType = file.type || 'application/octet-stream';
  const size = file.size;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
  const createdAt = now.toISOString();
  const expiresAtIso = expiresAt.toISOString();

  // Build public URL: origin + id + encoded filename
  const origin = new URL(c.req.url).origin;
  const url = `${origin}/${id}/${encodeURIComponent(filename)}`;

  // Upload to R2
  try {
    const arrayBuffer = await file.arrayBuffer() as ArrayBuffer;
    await c.env.R2_BUCKET.put(r2Key, arrayBuffer, {
      httpMetadata: { contentType },
    });
  } catch (err) {
    console.error('R2 upload error:', err);
    return c.json({ error: 'Failed to upload file to storage' }, 500);
  }

  // Persist record in D1
  try {
    await c.env.D1_DATABASE.prepare(
      `INSERT INTO files (id, filename, content_type, size, r2_key, url, ttl_seconds, expires_at, created_at, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    )
      .bind(id, filename, contentType, size, r2Key, url, ttlSeconds, expiresAtIso, createdAt)
      .run();
  } catch (err) {
    console.error('D1 insert error:', err);
    // Best-effort R2 cleanup on DB failure
    await c.env.R2_BUCKET.delete(r2Key).catch(() => null);
    return c.json({ error: 'Failed to record file metadata' }, 500);
  }

  return c.json(
    {
      id,
      filename,
      url,
      size,
      content_type: contentType,
      ttl: ttlRaw,
      ttl_seconds: ttlSeconds,
      expires_at: expiresAtIso,
      created_at: createdAt,
    },
    201,
  );
});

export default uploadRoute;
