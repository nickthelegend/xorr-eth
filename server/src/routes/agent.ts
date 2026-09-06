/**
 * The machine surface — reachable only by a deployed agent identity.
 *
 * ## Why this exists
 *
 * The trading loop runs `startScheduler()` inside the API process today, which works and
 * scales badly: a slow tick blocks requests, a crash in either takes both down, and there is
 * no way to run the loop somewhere the API is not. Splitting them needs the loop to be able
 * to say WHO it is over HTTP — and "whoever can reach the port" is not an answer.
 *
 * So the tick is exposed here, behind a scoped key. `SCHEDULER=off` on the API service and a
 * worker calling `POST /agent/tick` gives the same behaviour with the two concerns separated.
 * Leave `SCHEDULER` on and this surface is simply an alternative trigger; the period claim in
 * `runStrategy` means both running at once is a no-op, not a double buy.
 *
 * ## What a key does and does not buy
 *
 * It decides who may ASK. It does not widen what may happen: `runStrategy` still reads the
 * on-chain cap, the venue allowlist and the expiry on every run, and the token program still
 * refuses anything past the approval. An agent key with every scope cannot spend a dollar the
 * user did not authorise on-chain.
 *
 * The two trade scopes are separate because the two sides of the book are separate risks. A
 * worker that opens positions holds `trade:open`; the one that closes them holds
 * `trade:close`. Neither can do the other's job, so a leaked key costs you one side.
 *
 * Which means a worker that runs the WHOLE book needs both, and that is deliberate rather
 * than an oversight — `/agent/tick` can open a due DCA and close a due stop in the same
 * pass, so a key holding one side would either act outside its remit or half-run the book.
 * The deployment therefore has three identities: `entry-agent`, `exit-agent`, and a
 * `scheduler` that holds both and does nothing else.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { one, query } from '../db/index.js';
import { principalOf, requireScope } from '../auth/middleware.js';
import { createAgentKey, listAgentKeys, revokeAgentKey, type Scope } from '../auth/agentKeys.js';
import { tick } from '../executor/scheduler.js';
import { runStrategy, type StrategyRow } from '../executor/run.js';

export const agentSurface = new Hono();

/** Who am I, and what may I do? The first call a deployed worker makes. */
agentSurface.get('/agent/whoami', (c) => {
  const p = principalOf(c);
  return c.json({ kind: p?.kind, id: p?.id, name: p?.name, scopes: p?.scopes ?? [] });
});

/**
 * One scheduler tick.
 *
 * Needs BOTH trade scopes, because a tick can do either: a due DCA opens, a due exit rule
 * closes. A worker holding one side only should not be able to run a pass that might do the
 * other — it would either act outside its remit or half-run the book, and both are worse
 * than being told no.
 */
agentSurface.post(
  '/agent/tick',
  requireScope('trade:open'),
  requireScope('trade:close'),
  async (c) => {
    const ran = await tick();
    return c.json({ ran });
  },
);

/**
 * Run ONE strategy now, by id.
 *
 * Not wallet-scoped, unlike the user-facing `/strategies/:id/run` — a deployed worker legit-
 * imately acts across every wallet it serves. That is exactly why it sits behind a key and
 * not behind a session.
 */
agentSurface.post('/agent/strategies/:id/run', requireScope('trade:open'), async (c) => {
  const row = await one<StrategyRow>(`SELECT * FROM strategies WHERE id = $1`, [
    c.req.param('id'),
  ]);
  if (!row) return c.json({ error: 'not_found' }, 404);
  const outcome = await runStrategy(row);
  return c.json(outcome, outcome.status === 'failed' ? 502 : 200);
});

/** What the loop would pick up on its next pass. Read-only, for a worker's own health check. */
agentSurface.get('/agent/due', requireScope('read'), async (c) => {
  const rows = await query<{ id: string; label: string; kind: string; next_run_at: Date }>(
    `SELECT id, label, kind, next_run_at FROM strategies
      WHERE state IN ('live','watch') AND next_run_at IS NOT NULL AND next_run_at <= now()
      ORDER BY next_run_at ASC LIMIT 20`,
  );
  return c.json({ due: rows });
});

// ── Identities. Operator only, and the operator cannot trade. ────────────────

agentSurface.get('/agent/keys', requireScope('admin'), async (c) => {
  return c.json(await listAgentKeys());
});

const KeyInput = z.object({
  name: z.string().min(1).max(64),
  scopes: z.array(z.enum(['read', 'trade:open', 'trade:close', 'admin'])).min(1),
});

agentSurface.post('/agent/keys', requireScope('admin'), async (c) => {
  const body = KeyInput.parse(await c.req.json());
  const created = await createAgentKey(body.name, body.scopes as Scope[]);
  // The plaintext is returned ONCE. There is no route that can show it again, which is the
  // property that makes storing only the digest worth anything.
  return c.json({ ...created, scopes: body.scopes }, 201);
});

agentSurface.delete('/agent/keys/:id', requireScope('admin'), async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'not_found' }, 404);
  const ok = await revokeAgentKey(id);
  return ok ? c.json({ ok: true }) : c.json({ error: 'not_found' }, 404);
});
