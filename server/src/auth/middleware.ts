/**
 * Auth middleware — every route except /health is behind it.
 *
 * The previous build enforced limits server-side but had no notion of WHO was calling. That made
 * the limits meaningless in a multi-user world: anyone could spend anyone's cap. This binds every
 * request to a verified Privy user, and `requireUser` is the only way a route reads that identity.
 */
import type { Context, Next } from 'hono';
import { UnauthorizedError, verifyToken, type AuthedUser } from './privy.js';

/**
 * Routes reachable without a token. Deliberately tiny.
 *
 * Market data is public on purpose: a spot price is not user data, and gating it behind a session
 * means an unauthenticated visitor sees a market list of dashes. Nothing under these paths reads
 * `requireUser`, so none of them can leak a wallet, a policy or a fill.
 */
const PUBLIC_PATHS = new Set([
  '/health',
  '/market/quotes',
  '/market/ohlc',
  '/market/symbols',
  '/market/tradable',
  '/market/stocks',
  '/yield/supply',
  /*
   * The verification console.
   *
   * Public for the same reason the contract is: the whole argument is that you do not have to
   * trust us, and a proof you need our permission to run is not a proof. Every probe behind it is
   * a read of something already public — the chain, the subgraph, a price feed — and the
   * wallet-specific ones take an address anyone could paste into an explorer.
   */
  '/verify',
  /** A name on a public chain is public. Gating it would only make screens slower. */
  '/basename',
  /** Operational, and read-only. A health check behind a session cannot be used by a load balancer. */
  '/metrics',
  /** A second opinion on a public price is still a public price. */
  '/market/crosscheck',
]);

/** Path prefixes that are public. `/perp/:symbol` is a mark price, not user data. */
const PUBLIC_PREFIXES = ['/perp/'];

declare module 'hono' {
  interface ContextVariableMap {
    user: AuthedUser;
  }
}

export async function authMiddleware(c: Context, next: Next) {
  const isPublic =
    PUBLIC_PATHS.has(c.req.path) || PUBLIC_PREFIXES.some((p) => c.req.path.startsWith(p));
  if (isPublic || c.req.method === 'OPTIONS') return next();

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
