import { createMiddleware } from 'hono/factory';
import type { Env } from '../types';
import { sha256Hex, safeEqual } from '../lib/crypto';

/**
 * Validates Bearer token. Accepts either:
 *  1. Legacy single API_KEY env (constant-time compare)
 *  2. User-issued key from D1 api_keys table (sha-256 hash lookup)
 *
 * Updates last_used_at on successful D1 key match (best-effort, non-blocking).
 */
export const authMiddleware = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized: missing Bearer token' }, 401);
  }

  const token = authHeader.slice(7);

  // Legacy single-key fallback
  if (c.env.API_KEY && safeEqual(token, c.env.API_KEY)) {
    await next();
    return;
  }

  // D1-backed key lookup
  try {
    const hash = await sha256Hex(token);
    const row = await c.env.D1_DATABASE
      .prepare('SELECT id FROM api_keys WHERE key_hash = ? AND revoked = 0 LIMIT 1')
      .bind(hash)
      .first<{ id: string }>();
    if (row) {
      // Best-effort last_used_at update — do not block request
      c.executionCtx.waitUntil(
        c.env.D1_DATABASE
          .prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?')
          .bind(new Date().toISOString(), row.id)
          .run()
          .catch(() => undefined),
      );
      await next();
      return;
    }
  } catch (err) {
    console.error('auth lookup error:', err);
    return c.json({ error: 'Auth lookup failed' }, 500);
  }

  return c.json({ error: 'Unauthorized: invalid API key' }, 401);
});
