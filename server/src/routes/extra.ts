/** Backtest, leaderboard and proposal routes — PLAN.md 12.10 / 12.22 / 12.23. */
import { randomUUID } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { one, query, tx } from '../db/index.js';
import { append } from '../audit/log.js';
import { backtestDca, type Lookback } from '../backtest/engine.js';
import { leaderboard } from '../agents/leaderboard.js';
import { PERSONAS } from '../bot/personas.js';
import { speak, fallbackLine } from '../bot/llm.js';
import { TONE_INSTRUCTIONS, type ToneId } from '../bot/tone.js';
import { briefing } from '../news/feed.js';
import { propose } from '../bot/propose.js';
import { send } from '../notifications/push.js';
import { quote } from '../venues/oneinch.js';
import { requireUser } from '../auth/middleware.js';
import { decide } from '../graph/decide.js';
import { health as graphHealth, dailySpendFor, spendsFor } from '../graph/client.js';

export const extra = new Hono();

/** Scoped to the authenticated Privy user — never "the first wallet row". */
async function walletId(c: Context): Promise<string | undefined> {
  const { userId } = requireUser(c);
  const w = await one<{ id: string }>(`SELECT id FROM wallets WHERE user_id = $1 LIMIT 1`, [userId]);
  return w?.id;
}

extra.get('/agents/leaderboard', async (c) => {
  const id = await walletId(c);
  if (!id) return c.json([]);
  return c.json(await leaderboard(id));
});

extra.get('/agents/:id/backtest', async (c) => {
  const lookback = (c.req.query('lookback') ?? '90d') as Lookback;
  const id = await walletId(c);
  const cap = id
    ? Number(
        (
          await one<{ daily_cap_usd: string }>(
            `SELECT daily_cap_usd FROM delegations WHERE wallet_id=$1 ORDER BY created_at DESC LIMIT 1`,
            [id],
          )
        )?.daily_cap_usd ?? 1600,
      )
    : 1600;
  const symbol = c.req.query('symbol') ?? 'SOL';
  try {
    return c.json(
      await backtestDca({
        symbol,
        lookback,
        perRunUsd: Number(c.req.query('perRun') ?? 50),
        dailyCapUsd: cap,
        everyNDays: 7,
      }),
    );
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});

// ── Approve-before-execute — PLAN.md 12.10 [G27] ─────────────────────────────

extra.get('/proposals/current', async (c) => {
  const id = await walletId(c);
  if (!id) return c.json(null);
  const row = await one<{
    id: string;
    agent: string;
    payload: Record<string, string>;
    expires_at: Date;
    decision: string | null;
  }>(
    `SELECT * FROM proposals WHERE wallet_id=$1 AND decision IS NULL AND expires_at > now()
     ORDER BY created_at DESC LIMIT 1`,
    [id],
  );
  if (!row) return c.json(null);
  return c.json({
    id: row.id,
    agent: row.agent,
    ...row.payload,
    expiresAt: new Date(row.expires_at).getTime(),
  });
});

/**
 * Ask the agent to consider a trade. This is what the Bot tab calls when it finds no open
 * proposal — without it the approve-before-execute pipeline had no producer and the thread was
 * permanently empty.
 */
extra.post('/proposals/generate', async (c) => {
  const id = await walletId(c);
  if (!id) return c.json({ error: 'no_wallet' }, 400);
  const tone = ((await c.req.json().catch(() => ({}))) as { tone?: ToneId }).tone ?? 'dry';
  const result = await propose(id, tone);
  if (!result.created) {
    // A decline is a first-class event: screen 15 shows what the bot chose NOT to do.
    if (result.reason === 'no_setup' || result.reason === 'no_market_data') {
      await append({
        walletId: id,
        agent: 'Momentum Scout',
        action: `Proposed nothing`,
        detail: result.detail,
        kind: 'block',
        payload: { reason: result.reason },
      });
    }
    return c.json(result);
  }
  return c.json({
    created: true,
    id: result.id,
    agent: 'Momentum Scout',
    ...result.payload,
    expiresAt: Date.now() + 252_000,
  });
});

extra.post('/proposals', async (c) => {
  const body = z
    .object({
      agent: z.string(),
      payload: z.record(z.string(), z.string()),
      ttlSeconds: z.number().positive().max(3600).default(252),
    })
    .parse(await c.req.json());
  const id = await walletId(c);
  if (!id) return c.json({ error: 'no_wallet' }, 400);
  const row = await one(
    `INSERT INTO proposals (id, wallet_id, agent, payload, expires_at)
     VALUES ($1,$2,$3,$4, now() + ($5 || ' seconds')::interval) RETURNING *`,
    [randomUUID(), id, body.agent, JSON.stringify(body.payload), String(body.ttlSeconds)],
  );
  return c.json({ id: row!.id, expiresAt: new Date(row!.expires_at).getTime() });
});

extra.post('/proposals/:id/decide', async (c) => {
  const body = z.object({ decision: z.enum(['approve', 'skip']) }).parse(await c.req.json());
  const pid = c.req.param('id');
  const wid = await walletId(c);
  if (!wid) return c.json({ error: 'no_wallet' }, 400);

  return c.json(
    await tx(async (client) => {
      // Idempotent: the UPDATE only matches an undecided, unexpired proposal, so a double-approve
      // cannot double-fill. PLAN.md 12.10.
      const res = await client.query<{ id: string; agent: string; payload: Record<string, string> }>(
        `UPDATE proposals SET decision=$2, decided_at=now()
         WHERE id=$1 AND decision IS NULL AND expires_at > now()
         RETURNING id, agent, payload`,
        [pid, body.decision],
      );
      const row = res.rows[0];
      if (!row) {
        const existing = await client.query<{ decision: string | null; expires_at: Date }>(
          `SELECT decision, expires_at FROM proposals WHERE id=$1`,
          [pid],
        );
        const e = existing.rows[0];
        if (!e) return { message: 'That proposal no longer exists.', status: 'gone' };
        if (e.decision) return { message: 'That was already decided.', status: e.decision };
        return {
          message: 'That proposal expired before you decided. I did not place it.',
          status: 'expired',
        };
      }

      const message =
        body.decision === 'approve'
          ? `Filled ${row.payload.action ?? 'the order'} at ${row.payload.entry ?? 'the quoted price'}. Stop set at ${row.payload.stop ?? 'your level'}.`
          : `Skipped. I will not re-propose ${row.payload.symbol ?? 'this'} today.`;

      await append(
        {
          walletId: wid,
          agent: row.agent,
          action: body.decision === 'approve' ? 'Approved a proposal' : 'Skipped a proposal',
          detail: message,
          kind: body.decision === 'approve' ? 'trade' : 'block',
          payload: { proposalId: row.id },
        },
        client,
      );
      return { message, status: body.decision };
    }),
  );
});

// ── The bot's voice ──────────────────────────────────────────────────────────

extra.post('/bot/say', async (c) => {
  const body = z
    .object({
      persona: z.enum(['momentum-scout', 'earnings-desk', 'yield-keeper', 'drawdown-guard']),
      situation: z.string().min(3).max(600),
      tone: z.enum(['dry', 'sharp', 'flat']).default('dry'),
    })
    .parse(await c.req.json());

  const out = await speak({
    persona: body.persona,
    toneInstruction: TONE_INSTRUCTIONS[body.tone as ToneId],
    situation: body.situation,
  });

  if (out.ok) return c.json({ text: out.text, model: out.model, source: 'model' });
  // The facts half of a message is always rendered by the client from real records, so a rejected
  // voice segment costs a quip and nothing else.
  return c.json({
    text: fallbackLine(body.persona),
    source: 'fallback',
    reason: out.reason,
    detail: out.detail,
  });
});

// GET /agents moved to server/src/agents/routes.ts, where it reads the persisted roster.

extra.get('/briefing', async (c) => {
  const id = await walletId(c);
  if (!id) return c.json([]);
  const tone = (c.req.query('tone') ?? 'dry') as ToneId;
  try {
    return c.json(await briefing(id, tone));
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});

extra.post('/devices/register', async (c) => {
  const body = z.object({ token: z.string().min(10), platform: z.string() }).parse(await c.req.json());
  const id = await walletId(c);
  if (!id) return c.json({ error: 'no_wallet' }, 400);
  await query(
    `INSERT INTO devices (token, wallet_id, platform) VALUES ($1,$2,$3)
     ON CONFLICT (token) DO UPDATE SET wallet_id=EXCLUDED.wallet_id`,
    [body.token, id, body.platform],
  );
  return c.json({ ok: true });
});

extra.post('/notify/test', async (c) => {
  const id = await walletId(c);
  if (!id) return c.json({ error: 'no_wallet' }, 400);
  return c.json(
    await send(id, {
      title: 'xorr',
      body: 'Your recurring buy ran.',
      route: '/activity',
    }),
  );
});

// ── Venues — 1inch ───────────────────────────────────────────────────────────

extra.get('/swap/quote', async (c) => {
  requireUser(c);
  try {
    const q = await quote({
      inSymbol: (c.req.query('in') ?? 'ETH').toUpperCase(),
      outSymbol: (c.req.query('out') ?? 'USDC').toUpperCase(),
      amount: Number(c.req.query('amount') ?? 1),
    });
    return c.json(q);
  } catch (e) {
    // No route is a real answer. The screen says so rather than showing a computed guess.
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});

// ── The Graph — the agent's reasoning surface ────────────────────────────────

/** What the bot would decide right now, and why. Read straight from indexed chain data. */
extra.get('/agent/decision', async (c) => {
  const id = await walletId(c);
  if (!id) return c.json({ error: 'no_wallet' }, 400);
  const w = await one<{ address: string }>(`SELECT address FROM wallets WHERE id=$1`, [id]);
  if (!w) return c.json({ error: 'no_wallet' }, 400);
  try {
    return c.json(
      await decide({
        owner: w.address,
        wantUsd: Number(c.req.query('usd') ?? 100),
        token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      }),
    );
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});

extra.get('/graph/health', async (c) => {
  requireUser(c);
  try {
    return c.json(await graphHealth());
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});

extra.get('/graph/activity', async (c) => {
  const id = await walletId(c);
  if (!id) return c.json({ spends: [], daily: [] });
  const w = await one<{ address: string }>(`SELECT address FROM wallets WHERE id=$1`, [id]);
  if (!w) return c.json({ spends: [], daily: [] });
  const [spends, daily] = await Promise.all([spendsFor(w.address), dailySpendFor(w.address)]);
  return c.json({ spends, daily });
});
