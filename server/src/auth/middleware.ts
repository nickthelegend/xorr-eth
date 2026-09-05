/**
 * Auth middleware — every route except /health is behind it.
 *
 * The previous build enforced limits server-side but had no notion of WHO was calling. That made
 * the limits meaningless in a multi-user world: anyone could spend anyone's cap. This binds every
 * request to a verified Privy user, and `requireUser` is the only way a route reads that identity.
 */
import type { Context, Next } from 'hono';
import { UnauthorizedError, verifyToken, type AuthedUser } from './privy.js';

/** Routes reachable without a token. Deliberately tiny. */
const PUBLIC_PATHS = new Set(['/health']);

declare module 'hono' {
  interface ContextVariableMap {
    user: AuthedUser;
  }
}

export async function authMiddleware(c: Context, next: Next) {
  if (PUBLIC_PATHS.has(c.req.path) || c.req.method === 'OPTIONS') return next();

  try {
    const user = await verifyToken(c.req.header('authorization'));
    c.set('user', user);
  } catch (e) {
    const detail = e instanceof Error ? e.message : 'Unauthorized';
    return c.json({ error: 'unauthorized', detail }, 401);
  }
  return next();
}

/** The ONLY way a route learns who is calling. */
export function requireUser(c: Context): AuthedUser {
  const user = c.get('user');
  if (!user) throw new UnauthorizedError('No authenticated user on this request.');
  return user;
}
