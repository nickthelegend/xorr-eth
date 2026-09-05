import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import 'dotenv/config';
import { ZodError } from 'zod';
import { routes } from './routes/index.js';
import { extra } from './routes/extra.js';
import { market, warmMarketCache } from './routes/market.js';
import { agents } from './agents/routes.js';
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

// Auth before ANY route. An unauthenticated trading server must not be a possible state.
app.use('*', authMiddleware);

app.route('/', routes);
app.route('/', extra);
app.route('/', market);
app.route('/', agents);

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
