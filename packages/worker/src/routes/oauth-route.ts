import { Hono } from 'hono';
import type { Env } from '../types';
import { parseCookies, serializeCookie } from '../lib/cookies';
import { randomToken } from '../lib/crypto';
import { createSession, deleteSession, SESSION_COOKIE, SESSION_MAX_AGE } from '../lib/sessions';

const STATE_COOKIE = 'f2u_oauth_state';

const oauthRoute = new Hono<{ Bindings: Env }>();

function isAllowed(env: Env, login: string): boolean {
  const allow = (env.ADMIN_GITHUB_USERS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (allow.length === 0) return true; // open mode if not configured
  return allow.includes(login.toLowerCase());
}

function baseUrl(env: Env, c: { req: { url: string } }): string {
  if (env.BASE_URL) return env.BASE_URL.replace(/\/$/, '');
  const u = new URL(c.req.url);
  return `${u.protocol}//${u.host}`;
}

// GET /auth/github — start OAuth
oauthRoute.get('/auth/github', (c) => {
  if (!c.env.GITHUB_CLIENT_ID) {
    return c.json({ error: 'GitHub OAuth not configured (missing GITHUB_CLIENT_ID)' }, 500);
  }
  const state = randomToken(16);
  const redirectUri = `${baseUrl(c.env, c)}/auth/github/callback`;
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', c.env.GITHUB_CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', 'read:user user:email');
  url.searchParams.set('state', state);

  c.header(
    'Set-Cookie',
    serializeCookie(STATE_COOKIE, state, { maxAge: 600, httpOnly: true, secure: true, sameSite: 'Lax' }),
  );
  return c.redirect(url.toString(), 302);
});

// GET /auth/github/callback
oauthRoute.get('/auth/github/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  if (!code || !state) return c.json({ error: 'Missing code/state' }, 400);

  const cookies = parseCookies(c.req.header('Cookie'));
  if (!cookies[STATE_COOKIE] || cookies[STATE_COOKIE] !== state) {
    return c.json({ error: 'Invalid state' }, 400);
  }

  // Exchange code → access_token
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: c.env.GITHUB_CLIENT_ID,
      client_secret: c.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${baseUrl(c.env, c)}/auth/github/callback`,
    }),
  });
  if (!tokenRes.ok) return c.json({ error: 'GitHub token exchange failed' }, 502);
  const tokenJson = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (!tokenJson.access_token) return c.json({ error: tokenJson.error ?? 'No access_token' }, 502);

  // Fetch user profile
  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${tokenJson.access_token}`,
      'User-Agent': 'f2u-worker',
      Accept: 'application/vnd.github+json',
    },
  });
  if (!userRes.ok) return c.json({ error: 'GitHub user fetch failed' }, 502);
  const profile = (await userRes.json()) as {
    id: number;
    login: string;
    name: string | null;
    email: string | null;
    avatar_url: string | null;
  };

  if (!isAllowed(c.env, profile.login)) {
    return c.html(
      `<html><body style="font-family:sans-serif;padding:40px;text-align:center"><h2>Access denied</h2><p>GitHub user <code>${profile.login}</code> is not authorized.</p><a href="/login">Back</a></body></html>`,
      403,
    );
  }

  // Upsert user
  const db = c.env.D1_DATABASE;
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO users (github_id, github_login, name, email, avatar_url, last_login_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(github_id) DO UPDATE SET
         github_login = excluded.github_login,
         name = excluded.name,
         email = excluded.email,
         avatar_url = excluded.avatar_url,
         last_login_at = excluded.last_login_at`,
    )
    .bind(profile.id, profile.login, profile.name, profile.email, profile.avatar_url, now)
    .run();

  const userRow = await db
    .prepare('SELECT id FROM users WHERE github_id = ? LIMIT 1')
    .bind(profile.id)
    .first<{ id: number }>();
  if (!userRow) return c.json({ error: 'User upsert failed' }, 500);

  const session = await createSession(c.env, userRow.id);

  // Clear state cookie + set session cookie, then redirect
  const headers = new Headers();
  headers.append(
    'Set-Cookie',
    serializeCookie(STATE_COOKIE, '', { maxAge: 0, httpOnly: true, secure: true, sameSite: 'Lax' }),
  );
  headers.append(
    'Set-Cookie',
    serializeCookie(SESSION_COOKIE, session.id, {
      maxAge: SESSION_MAX_AGE,
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    }),
  );
  headers.set('Location', '/dashboard');
  return new Response(null, { status: 302, headers });
});

// POST /auth/logout
oauthRoute.post('/auth/logout', async (c) => {
  const cookies = parseCookies(c.req.header('Cookie'));
  const sid = cookies[SESSION_COOKIE];
  if (sid) await deleteSession(c.env, sid).catch(() => undefined);
  c.header(
    'Set-Cookie',
    serializeCookie(SESSION_COOKIE, '', { maxAge: 0, httpOnly: true, secure: true, sameSite: 'Lax' }),
  );
  return c.json({ ok: true });
});

export default oauthRoute;
