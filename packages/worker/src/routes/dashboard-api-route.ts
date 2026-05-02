import { Hono } from 'hono';
import type { Env } from '../types';
import { parseCookies } from '../lib/cookies';
import { sha256Hex, randomToken } from '../lib/crypto';
import { getSession, SESSION_COOKIE } from '../lib/sessions';

const dashboardApiRoute = new Hono<{ Bindings: Env }>();

interface UserRow {
  id: number;
  github_id: number;
  github_login: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
}

interface ApiKeyRow {
  id: string;
  user_id: number;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked: number;
}

async function requireUser(c: { env: Env; req: { header: (k: string) => string | undefined } }): Promise<UserRow | null> {
  const cookies = parseCookies(c.req.header('Cookie'));
  const session = await getSession(c.env, cookies[SESSION_COOKIE]);
  if (!session) return null;
  const user = await c.env.D1_DATABASE
    .prepare('SELECT * FROM users WHERE id = ? LIMIT 1')
    .bind(session.user_id)
    .first<UserRow>();
  return user ?? null;
}

// GET /api/me — current user
dashboardApiRoute.get('/api/me', async (c) => {
  const user = await requireUser(c);
  if (!user) return c.json({ error: 'Unauthenticated' }, 401);
  return c.json({
    id: user.id,
    github_login: user.github_login,
    name: user.name,
    email: user.email,
    avatar_url: user.avatar_url,
  });
});

// GET /api/keys — list user's keys (no plaintext)
dashboardApiRoute.get('/api/keys', async (c) => {
  const user = await requireUser(c);
  if (!user) return c.json({ error: 'Unauthenticated' }, 401);
  const rows = await c.env.D1_DATABASE
    .prepare(
      `SELECT id, name, prefix, created_at, last_used_at, revoked
       FROM api_keys
       WHERE user_id = ?
       ORDER BY created_at DESC`,
    )
    .bind(user.id)
    .all<ApiKeyRow>();
  return c.json({ keys: rows.results });
});

// POST /api/keys — create new key, returns plaintext ONCE
dashboardApiRoute.post('/api/keys', async (c) => {
  const user = await requireUser(c);
  if (!user) return c.json({ error: 'Unauthenticated' }, 401);

  let body: { name?: string };
  try {
    body = (await c.req.json()) as { name?: string };
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
  const name = (body.name ?? '').trim().slice(0, 80) || 'Untitled key';

  // Token format: f2u_<32-byte-hex>
  const secret = randomToken(32);
  const plaintext = `f2u_${secret}`;
  const hash = await sha256Hex(plaintext);
  const id = crypto.randomUUID();
  const prefix = plaintext.slice(0, 12); // "f2u_xxxxxxxx" — 8 hex chars after prefix

  await c.env.D1_DATABASE
    .prepare(
      `INSERT INTO api_keys (id, user_id, name, key_hash, prefix)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(id, user.id, name, hash, prefix)
    .run();

  return c.json({
    id,
    name,
    prefix,
    key: plaintext, // shown only on creation
    created_at: new Date().toISOString(),
  });
});

// DELETE /api/keys/:id — revoke
dashboardApiRoute.delete('/api/keys/:id', async (c) => {
  const user = await requireUser(c);
  if (!user) return c.json({ error: 'Unauthenticated' }, 401);
  const { id } = c.req.param();
  const result = await c.env.D1_DATABASE
    .prepare('UPDATE api_keys SET revoked = 1 WHERE id = ? AND user_id = ?')
    .bind(id, user.id)
    .run();
  if (!result.success || result.meta.changes === 0) {
    return c.json({ error: 'Key not found' }, 404);
  }
  return c.json({ id, revoked: true });
});

export default dashboardApiRoute;
