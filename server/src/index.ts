import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import 'dotenv/config';
import { ZodError } from 'zod';
import { routes } from './routes/index.js';
import { extra } from './routes/extra.js';
import { market, warmMarketCache } from './routes/market.js';
import { agents } from './agents/routes.js';
import { alerts } from './routes/alerts.js';
import { verifyRoutes } from './routes/verify.js';
import { panic } from './routes/panic.js';
import { startScheduler } from './executor/scheduler.js';
import { CHAIN_KEY, rpcUrl } from './evm/chains.js';
import { DELEGATION_ADDRESS, delegatePublicKey } from './evm/delegation.js';
import { authMiddleware } from './auth/middleware.js';
import { DATABASE_URL } from './db/index.js';

const app = new Hono();

app.use('*', async (c, next) => {
  await next();
  c.header('access-control-allow-origin', '*');
  // The web client sends `Authorization: Bearer <privy token>`; without it here the browser's
  // preflight rejects every authenticated request and the whole app looks logged-out.
  c.header('access-control-allow-headers', 'content-type,authorization');
  c.header('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS');
});
app.options('*', (c) => c.body(null, 204));

app.onError((err, c) => {
  // A malformed request is the CLIENT's fault, and saying 500 tells the caller to retry something
  // that will never work. Zod failures and unparseable bodies both used to land here as 500s with
  // a raw validator dump, which was wrong on both the status and the message.
  if (err instanceof ZodError) {
    const detail = err.issues
      .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
      .join('; ');
    return c.json({ error: 'invalid_request', detail }, 400);
  }
  if (err instanceof SyntaxError) {
    return c.json({ error: 'invalid_json', detail: err.message }, 400);
  }
  // Everything else is ours. Surface the real message: a trading server that hides its errors is
  // worse than one that fails.
  console.error('[error]', err.message);
  return c.json({ error: err.message }, 500);
});

/**
 * A ceiling on the unauthenticated surface.
 *
 * The /market/* routes are public on purpose — a spot price is not user data — but public and
 * unlimited are different things: they proxy a rate-limited upstream on our key, so one script can
 * exhaust the quota for every real user. Everything served from cache is cheap; this only bites a
 * caller asking faster than a human could.
 *
 * Deliberately per-process and in memory. A distributed limiter is the right answer behind a load
 * balancer and the wrong answer to reach for before there is one.
 */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 240;
const hits = new Map<string, { count: number; resetAt: number }>();

app.use('*', async (c, next) => {
  if (!c.req.path.startsWith('/market/') && c.req.path !== '/yield/supply') return next();

  const who =
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    c.req.header('x-real-ip') ??
    'local';
  const now = Date.now();
  const row = hits.get(who);
  if (!row || now > row.resetAt) {
    hits.set(who, { count: 1, resetAt: now + RATE_WINDOW_MS });
  } else if (++row.count > RATE_MAX) {
    c.header('retry-after', String(Math.ceil((row.resetAt - now) / 1000)));
    return c.json({ error: 'rate_limited', detail: 'Too many market requests.' }, 429);
  }

  // Keep the map from growing without bound on a long-running process.
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
  }
  return next();
});

// Auth before ANY route. An unauthenticated trading server must not be a possible state.
app.use('*', authMiddleware);

app.route('/', routes);
app.route('/', extra);
app.route('/', market);
app.route('/', agents);
app.route('/', alerts);
app.route('/', verifyRoutes);
app.route('/', panic);

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port });
console.log(`xorr executor on :${port}`);
console.log(`  db      ${DATABASE_URL.replace(/:[^:@]*@/, ':***@')}`);
console.log(`  chain    ${CHAIN_KEY} ${rpcUrl}`);
console.log(`  contract ${DELEGATION_ADDRESS}`);
console.log(`  delegate ${delegatePublicKey}`);
console.log('  auth     Privy (every route except /health)');

if (process.env.SCHEDULER !== 'off') startScheduler();

// Populate the price and chart caches before anyone opens a screen.
warmMarketCache();
