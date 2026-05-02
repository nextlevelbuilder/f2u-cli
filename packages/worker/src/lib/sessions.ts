import type { Env } from '../types';
import { randomToken } from './crypto';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
export const SESSION_COOKIE = 'f2u_session';

export interface SessionRow {
  id: string;
  user_id: number;
  expires_at: string;
  created_at: string;
}

export async function createSession(env: Env, userId: number): Promise<{ id: string; expiresAt: Date }> {
  const id = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  await env.D1_DATABASE.prepare(
    'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)',
  )
    .bind(id, userId, expiresAt.toISOString())
    .run();
  return { id, expiresAt };
}

export async function getSession(env: Env, sessionId: string | undefined): Promise<SessionRow | null> {
  if (!sessionId) return null;
  const row = await env.D1_DATABASE.prepare(
    'SELECT * FROM sessions WHERE id = ? LIMIT 1',
  )
    .bind(sessionId)
    .first<SessionRow>();
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    await deleteSession(env, sessionId).catch(() => undefined);
    return null;
  }
  return row;
}

export async function deleteSession(env: Env, sessionId: string): Promise<void> {
  await env.D1_DATABASE.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
}

export const SESSION_MAX_AGE = SESSION_TTL_SECONDS;
