import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import { authMiddleware } from './middleware/auth-middleware';
import uploadRoute from './routes/upload-route';
import serveRoute from './routes/serve-route';
import filesRoute from './routes/files-route';
import usageRoute from './routes/usage-route';
import { cleanupExpiredFiles } from './cron/cleanup-expired-files';

const app = new Hono<{ Bindings: Env }>();

// CORS on all routes
app.use('*', cors());

// --- Public routes ---

app.get('/health', (c) => c.json({ status: 'ok', ts: new Date().toISOString() }));

// File serving: public, registered before wildcard catch-all
app.route('/', serveRoute);

// --- Protected routes (auth required) ---

app.use('/upload', authMiddleware);
app.route('/', uploadRoute);

app.use('/files', authMiddleware);
app.use('/info/:id', authMiddleware);
app.use('/usage', authMiddleware);
app.route('/', filesRoute);
app.route('/', usageRoute);

// DELETE /:id — auth applied inline to avoid conflicting with serve route
app.delete('/:id', authMiddleware, async (c) => {
  // Delegate to filesRoute handler by re-using its logic inline
  // (Hono sub-app DELETE handler is already defined in filesRoute but registering
  //  it here ensures auth middleware fires before the wildcard serve GET)
  const { id } = c.req.param();
  const db = c.env.D1_DATABASE;

  let record: import('./types').FileRecord | null;
  try {
    const result = await db.prepare('SELECT * FROM files WHERE id = ? LIMIT 1').bind(id).first<import('./types').FileRecord>();
    record = result ?? null;
  } catch {
    return c.json({ error: 'Failed to retrieve file metadata' }, 500);
  }

  if (!record) return c.json({ error: 'File not found' }, 404);
  if (record.deleted === 1) return c.json({ error: 'File already deleted' }, 410);

  await c.env.R2_BUCKET.delete(record.r2_key).catch((err: unknown) => {
    console.error('R2 delete error (non-fatal):', err);
  });

  try {
    await db.prepare('UPDATE files SET deleted = 1 WHERE id = ?').bind(id).run();
  } catch {
    return c.json({ error: 'Failed to mark file as deleted' }, 500);
  }

  return c.json({ id, deleted: true });
});

// Scheduled cron handler
async function scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
  ctx.waitUntil(cleanupExpiredFiles(env));
}

export default {
  fetch: app.fetch,
  scheduled,
};
