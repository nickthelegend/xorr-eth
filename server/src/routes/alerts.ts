/**
 * Alerts — the moments the agents interrupt you for.
 *
 * `app/alerts/new.tsx` built an alert object and discarded it, and the toggle POSTed to a route
 * that did not exist with its 404 swallowed by a `.catch`. The screen looked like it worked and
 * remembered nothing, which is a worse failure than an error would have been.
 */
import { randomUUID } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { one, query } from '../db/index.js';
import { requireUser } from '../auth/middleware.js';

export const alerts = new Hono();

type AlertRow = {
  id: string;
  kind: string;
  symbol: string | null;
  name: string;
  detail: string;
  enabled: boolean;
  config: Record<string, unknown>;
};

async function walletId(c: Context): Promise<string | undefined> {
  const { userId } = requireUser(c);
  const w = await one<{ id: string }>(`SELECT id FROM wallets WHERE user_id = $1 LIMIT 1`, [userId]);
  return w?.id;
}

const toApi = (r: AlertRow) => ({
  id: r.id,
  kind: r.kind,
  symbol: r.symbol,
  name: r.name,
  detail: r.detail,
  enabled: r.enabled,
  config: r.config,
  // The UI's `default` field means "on when you first see it". For a persisted alert the enabled
  // flag IS the answer, so they are the same thing rather than two sources for one fact.
  default: r.enabled,
});

alerts.get('/alerts', async (c) => {
  const id = await walletId(c);
  if (!id) return c.json([]);
  const rows = await query<AlertRow>(
    `SELECT * FROM alerts WHERE wallet_id = $1 ORDER BY created_at DESC`,
    [id],
  );
  return c.json(rows.map(toApi));
});

const NewAlert = z.object({
  kind: z.enum(['price', 'agent', 'risk']),
  symbol: z.string().optional(),
  name: z.string().min(1),
  detail: z.string().default(''),
  config: z.record(z.string(), z.unknown()).default({}),
});

alerts.post('/alerts', async (c) => {
  const body = NewAlert.parse(await c.req.json());
  const id = await walletId(c);
  if (!id) return c.json({ error: 'no_wallet' }, 400);

  const row = await one<AlertRow>(
    `INSERT INTO alerts (id, wallet_id, kind, symbol, name, detail, config)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [randomUUID(), id, body.kind, body.symbol ?? null, body.name, body.detail, JSON.stringify(body.config)],
  );
  return c.json(toApi(row!));
});

/** POST rather than PATCH: this is what the toggle on the alerts screen already calls. */
alerts.post('/alerts/:id', async (c) => {
  const body = z.object({ enabled: z.boolean() }).parse(await c.req.json());
  const id = await walletId(c);
  if (!id) return c.json({ error: 'no_wallet' }, 400);

  const row = await one<AlertRow>(
    `UPDATE alerts SET enabled = $3 WHERE id = $1 AND wallet_id = $2 RETURNING *`,
    [c.req.param('id'), id, body.enabled],
  );
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json(toApi(row));
});

alerts.delete('/alerts/:id', async (c) => {
  const id = await walletId(c);
  if (!id) return c.json({ error: 'no_wallet' }, 400);
  const row = await one<{ id: string }>(
    `DELETE FROM alerts WHERE id = $1 AND wallet_id = $2 RETURNING id`,
    [c.req.param('id'), id],
  );
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
});
