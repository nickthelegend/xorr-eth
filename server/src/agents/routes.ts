/**
 * Agents — hire, configure, fire.
 *
 * The roster was `Record<string, boolean>` in zustand: it survived a refresh and nothing else, so
 * the thing trading your money did not exist anywhere durable. These routes make an agent a row
 * that a reinstall cannot forget, that a strategy can belong to, and that can be measured against
 * its own filled trades rather than against a fixture.
 *
 * Everything is scoped to the caller's wallet. An agent id from another user must read as missing,
 * never as forbidden — the second answer confirms it exists.
 */
import { randomUUID } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { one, query } from '../db/index.js';
import { append } from '../audit/log.js';
import { currentWallet } from '../routes/wallet-context.js';
import { PERSONAS, type PersonaId } from '../bot/personas.js';
import { leaderboard } from './leaderboard.js';

export const agents = new Hono();

type AgentRow = {
  id: string;
  wallet_id: string;
  persona_id: string;
  name: string;
  hired: boolean;
  tone: string;
  risk_limits: Record<string, unknown>;
  created_at: Date;
};

/*
 * Delegates to `currentWallet` rather than asking again.
 *
 * This was its own `WHERE user_id = $1 LIMIT 1` with no ORDER BY — one of nine such copies, each
 * free to return a different wallet than the others on an account with more than one row. The
 * damage is not that a query is duplicated: it is that your agents, your alerts, your limits and
 * your trades could each be resolved against a DIFFERENT wallet within one signed-in session.
 * One definition, in `wallet-context`, is the whole point of that module.
 */
async function walletId(c: Context): Promise<string | undefined> {
  return (await currentWallet(c))?.id;
}

/** The palette a persona is drawn with. Product config, not measured data — legitimately local. */
const GRADIENTS: Record<string, { c1: string; c2: string }> = {
  'momentum-scout': { c1: '#5B93FF', c2: '#1B44CE' },
  'earnings-desk': { c1: '#F0BE55', c2: '#C98518' },
  'yield-keeper': { c1: '#49E39B', c2: '#12A45F' },
  'drawdown-guard': { c1: '#B58CFF', c2: '#7A45E0' },
};

function toApi(row: AgentRow, metrics?: { pnl30d: number; win: number; trades: number; metric: string }) {
  const persona = PERSONAS[row.persona_id as PersonaId];
  return {
    id: row.id,
    personaId: row.persona_id,
    name: row.name,
    role: persona?.role ?? '',
    hired: row.hired,
    tone: row.tone,
    riskLimits: row.risk_limits,
    ...(GRADIENTS[row.persona_id] ?? { c1: '#5B93FF', c2: '#1B44CE' }),
    // Zeros with a label, never a borrowed number: an agent that has not traded says so.
    pnl30d: metrics?.pnl30d ?? 0,
    win: metrics?.win ?? 0,
    trades: metrics?.trades ?? 0,
    metric: metrics?.metric ?? 'No record yet',
  };
}

/**
 * GET /agents — the four personas, each marked hired or not, with real metrics for the hired ones.
 *
 * The full roster is returned rather than only what is hired, because the roster screen shows all
 * four and needs to know which are which.
 */
agents.get('/agents', async (c) => {
  const id = await walletId(c);
  if (!id) {
    return c.json(
      Object.values(PERSONAS).map((p) =>
        toApi({
          id: p.id,
          wallet_id: '',
          persona_id: p.id,
          name: p.name,
          hired: false,
          tone: 'dry',
          risk_limits: {},
          created_at: new Date(),
        }),
      ),
    );
  }

  const [rows, board] = await Promise.all([
    query<AgentRow>(`SELECT * FROM agents WHERE wallet_id = $1`, [id]),
    leaderboard(id),
  ]);
  const byPersona = new Map(rows.map((r) => [r.persona_id, r]));
  const metrics = new Map(board.map((b) => [b.id, b]));

  return c.json(
    Object.values(PERSONAS).map((p) => {
      const row = byPersona.get(p.id);
      return toApi(
        row ?? {
          id: p.id,
          wallet_id: id,
          persona_id: p.id,
          name: p.name,
          hired: false,
          tone: 'dry',
          risk_limits: {},
          created_at: new Date(),
        },
        metrics.get(p.id),
      );
    }),
  );
});

const HireInput = z.object({
  personaId: z.string().refine((v) => v in PERSONAS, { message: 'unknown persona' }),
});

/**
 * Stop every agent on this wallet, now, until resumed — and read that state (PLAN.md 2.14).
 *
 * Enforced by the executor rather than remembered by one browser: every rule check reads it (`evaluate`'s
 * `killed`), so a scheduled run, a proposal and an order are all refused while it holds. It signs nothing
 * and costs nothing; the revoke on the Safety screen remains the stop that does not depend on this server
 * at all. A close the user places themselves is not an agent trading, and stays available.
 */
async function stoppedState(walletId: string): Promise<{ stopped: boolean; since: number | null }> {
  const row = await one<{ agents_stopped: boolean; agents_stopped_at: Date | null }>(
    `SELECT agents_stopped, agents_stopped_at FROM wallets WHERE id = $1`,
    [walletId],
  );
  return {
    stopped: row?.agents_stopped === true,
    since: row?.agents_stopped_at ? new Date(row.agents_stopped_at).getTime() : null,
  };
}

async function setStopped(c: Context, stopped: boolean) {
  const id = await walletId(c);
  if (!id) return c.json({ error: 'no_wallet' }, 400);
  const changed = await one<{ id: string }>(
    `UPDATE wallets SET agents_stopped = $2, agents_stopped_at = CASE WHEN $2 THEN now() ELSE NULL END
      WHERE id = $1 AND agents_stopped IS DISTINCT FROM $2 RETURNING id`,
    [id, stopped],
  );
  // Written once per change: a second tap on "stop" is not a second event.
  if (changed) {
    await append({
      walletId: id,
      agent: 'xorr',
      action: stopped ? 'You stopped the agents' : 'You resumed the agents',
      detail: stopped
        ? 'Nothing will be placed for you until you resume. Closing a position yourself still works.'
        : 'Strategies run on their schedules again, inside the same limits.',
      kind: 'risk',
    });
  }
  return c.json(await stoppedState(id));
}

agents.get('/agents/stopped', async (c) => {
  const id = await walletId(c);
  if (!id) return c.json({ stopped: false, since: null });
  return c.json(await stoppedState(id));
});
agents.post('/agents/stop', (c) => setStopped(c, true));
agents.post('/agents/resume', (c) => setStopped(c, false));

/** POST /agents — hire. Idempotent: hiring twice is the same agent, not two of them. */
agents.post('/agents', async (c) => {
  const body = HireInput.parse(await c.req.json());
  const id = await walletId(c);
  if (!id) return c.json({ error: 'no_wallet' }, 400);

  const persona = PERSONAS[body.personaId as PersonaId]!;
  const row = await one<AgentRow>(
    `INSERT INTO agents (id, wallet_id, persona_id, name)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (wallet_id, persona_id)
       DO UPDATE SET hired = true, fired_at = NULL
     RETURNING *`,
    [randomUUID(), id, persona.id, persona.name],
  );

  await append({
    walletId: id,
    agent: persona.name,
    action: `Hired ${persona.name}`,
    detail: `${persona.role}. It trades only inside the limits you already signed.`,
    kind: 'risk',
    payload: { personaId: persona.id },
  });

  return c.json(toApi(row!));
});

/**
 * The limits an agent can be held to (PLAN.md 2.15), and nothing else.
 *
 * Any record was accepted and nothing read it, so a limit spelled any way at all was saved and silently
 * ignored. These two are enforced on every run (`agentLimitRefusal` in `executor/run.ts`); an unknown key is
 * refused rather than stored as a limit that does nothing.
 */
const RiskLimits = z
  .object({
    maxUsdPerTrade: z.number().positive().optional(),
    maxUsdPerDay: z.number().positive().optional(),
  })
  .strict();

const PatchInput = z.object({
  tone: z.enum(['dry', 'sharp', 'flat']).optional(),
  riskLimits: RiskLimits.optional(),
});

/** PATCH /agents/:id — tone and limits. */
agents.patch('/agents/:id', async (c) => {
  const body = PatchInput.parse(await c.req.json());
  const id = await walletId(c);
  if (!id) return c.json({ error: 'no_wallet' }, 400);

  const row = await one<AgentRow>(
    `UPDATE agents SET
       tone = COALESCE($3, tone),
       risk_limits = COALESCE($4::jsonb, risk_limits)
     WHERE id = $1 AND wallet_id = $2
     RETURNING *`,
    [
      c.req.param('id'),
      id,
      body.tone ?? null,
      body.riskLimits ? JSON.stringify(body.riskLimits) : null,
    ],
  );
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json(toApi(row));
});

/**
 * DELETE /agents/:id — fire.
 *
 * Firing pauses the agent's strategies rather than deleting them. A user who fires an agent means
 * "stop trading", not "erase what you did" — the history has to survive, and a paused strategy can
 * be handed to another agent.
 */
agents.delete('/agents/:id', async (c) => {
  const id = await walletId(c);
  if (!id) return c.json({ error: 'no_wallet' }, 400);

  const row = await one<AgentRow>(
    `UPDATE agents SET hired = false, fired_at = now()
     WHERE id = $1 AND wallet_id = $2 RETURNING *`,
    [c.req.param('id'), id],
  );
  if (!row) return c.json({ error: 'not_found' }, 404);

  // Every chain's, deliberately: the agent is not per chain, and a fired agent must not keep trading
  // on a chain other than the one it was fired from.
  const paused = await query<{ id: string }>(
    `UPDATE strategies SET state = 'paused'
     WHERE agent_id = $1 AND state IN ('live','watch') RETURNING id`,
    [row.id],
  );

  await append({
    walletId: id,
    agent: row.name,
    action: `Fired ${row.name}`,
    detail:
      paused.length > 0
        ? `${paused.length} of its strategies were paused. Nothing was sold.`
        : 'It had nothing running.',
    kind: 'risk',
    payload: { agentId: row.id, pausedStrategies: paused.length },
  });

  return c.json({ ok: true, pausedStrategies: paused.length });
});
