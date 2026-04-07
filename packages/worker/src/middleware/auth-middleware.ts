import { createMiddleware } from 'hono/factory';
import type { Env } from '../types';

// Validates Bearer token against API_KEY env var
export const authMiddleware = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized: missing Bearer token' }, 401);
  }

  const token = authHeader.slice(7);

  if (token !== c.env.API_KEY) {
    return c.json({ error: 'Unauthorized: invalid API key' }, 401);
  }

  await next();
});
