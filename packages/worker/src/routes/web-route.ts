import { Hono } from 'hono';
import type { Env } from '../types';
import { loginPage } from '../web/login-page';
import { dashboardPage } from '../web/dashboard-page';
import { parseCookies } from '../lib/cookies';
import { getSession, SESSION_COOKIE } from '../lib/sessions';

const webRoute = new Hono<{ Bindings: Env }>();

webRoute.get('/login', (c) => c.html(loginPage));

webRoute.get('/dashboard', async (c) => {
  const cookies = parseCookies(c.req.header('Cookie'));
  const session = await getSession(c.env, cookies[SESSION_COOKIE]);
  if (!session) return c.redirect('/login', 302);
  return c.html(dashboardPage);
});

// Root → dashboard (which redirects to /login if no session)
webRoute.get('/', (c) => c.redirect('/dashboard', 302));

export default webRoute;
