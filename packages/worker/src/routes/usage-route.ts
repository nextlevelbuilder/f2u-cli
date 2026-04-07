import { Hono } from 'hono';
import type { Env } from '../types';

const usageRoute = new Hono<{ Bindings: Env }>();

// GET /usage — active and all-time file count + bytes
usageRoute.get('/usage', async (c) => {
  try {
    const now = new Date().toISOString();

    const [activeResult, totalResult] = await Promise.all([
      // Active: non-deleted, non-expired
      c.env.D1_DATABASE.prepare(
        `SELECT COUNT(*) as count, COALESCE(SUM(size), 0) as bytes
         FROM files
         WHERE deleted = 0 AND expires_at > ?`,
      )
        .bind(now)
        .first<{ count: number; bytes: number }>(),

      // All-time: every record ever inserted
      c.env.D1_DATABASE.prepare(
        `SELECT COUNT(*) as count, COALESCE(SUM(size), 0) as bytes
         FROM files`,
      ).first<{ count: number; bytes: number }>(),
    ]);

    return c.json({
      active: {
        count: activeResult?.count ?? 0,
        bytes: activeResult?.bytes ?? 0,
      },
      all_time: {
        count: totalResult?.count ?? 0,
        bytes: totalResult?.bytes ?? 0,
      },
    });
  } catch (err) {
    console.error('D1 usage query error:', err);
    return c.json({ error: 'Failed to retrieve usage stats' }, 500);
  }
});

export default usageRoute;
