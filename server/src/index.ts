import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import 'dotenv/config';
import { routes } from './routes/index.js';
import { extra } from './routes/extra.js';
import { startScheduler } from './executor/scheduler.js';
import { CLUSTER, RPC_URL } from './solana/connection.js';
import { DATABASE_URL } from './db/index.js';

const app = new Hono();

app.use('*', async (c, next) => {
  await next();
  c.header('access-control-allow-origin', '*');
  c.header('access-control-allow-headers', 'content-type');
  c.header('access-control-allow-methods', 'GET,POST,OPTIONS');
});
app.options('*', (c) => c.body(null, 204));

app.onError((err, c) => {
  // Surface the real message: a trading server that hides its errors is worse than one that fails.
  console.error('[error]', err.message);
  return c.json({ error: err.message }, 500);
});

app.route('/', routes);
app.route('/', extra);

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port });
console.log(`xorr executor on :${port}`);
console.log(`  db      ${DATABASE_URL.replace(/:[^:@]*@/, ':***@')}`);
console.log(`  cluster ${CLUSTER} ${RPC_URL}`);

if (process.env.SCHEDULER !== 'off') startScheduler();
