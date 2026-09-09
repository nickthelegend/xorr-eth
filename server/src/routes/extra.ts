/** Backtest, leaderboard and proposal routes — PLAN.md 12.10 / 12.22 / 12.23. */
import { randomUUID } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { one, query, tx } from '../db/index.js';
import { append } from '../audit/log.js';
import { backtestDca, backtestGrid, backtestMomentum, type Lookback } from '../backtest/engine.js';
import { leaderboard } from '../agents/leaderboard.js';
import { PERSONAS } from '../bot/personas.js';
import { speak } from '../bot/llm.js';
import { TONE_INSTRUCTIONS, type ToneId } from '../bot/tone.js';
import { briefing } from '../news/feed.js';
import { propose } from '../bot/propose.js';
import { send } from '../notifications/push.js';
import { quote, canonicalSymbol } from '../venues/oneinch.js';
import { requireUser } from '../auth/middleware.js';
import { currentWallet } from './wallet-context.js';
import { readPolicy } from '../evm/delegation.js';
import type { Address } from 'viem';
import { decide } from '../graph/decide.js';
import { health as graphHealth, dailySpendFor, indexDescription, spendsFor } from '../graph/client.js';

export const extra = new Hono();

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

extra.get('/agents/leaderboard', async (c) => {
  const id = await walletId(c);
  if (!id) return c.json([]);
  return c.json(await leaderboard(id));
});

/**
 * Why three of the four agents answer 422 here.
 *
 * A backtest is only honest when the strategy can actually be replayed over data we hold. Exactly
 * one of these can be:
 *
 *   - momentum-scout  — a Donchian breakout with a stop, defined entirely by daily closes. Replayed
 *                       bar by bar against the same series the live planner reads.
 *   - earnings-desk   — trades tokenized equities around EDGAR prints. Those tokens have no price
 *                       history at all: /oracle/:symbol exists precisely because the only series
 *                       that will ever exist for them is the one this deployment records by
 *                       looking. There is nothing to replay against.
 *   - yield-keeper    — supplies USDC to Aave v3. Its return is the pool's floating rate, not a
 *                       price path, and we do not hold the historical rate series.
 *   - drawdown-guard  — only ever CLOSES positions. Its result is a function of the book it is
 *                       guarding, so there is no strategy return independent of a portfolio.
 *
 * Before this, all four ran `backtestDca` over SOL and returned the same four numbers — and the
 * route never read `:id` at all, because `const id = await walletId(c)` shadowed it. Publishing one
 * strategy's numbers under another strategy's name is the single most misleading thing a screen
 * like this can do, so the three that cannot be measured now say why instead.
 */
const NOT_BACKTESTABLE: Record<string, string> = {
  'earnings-desk':
    'Earnings Desk trades tokenized equities around scheduled prints, and those tokens have no price history to replay — the only series that exists for them is the one this executor has recorded since it started looking.',
  'yield-keeper':
    'Yield Keeper does not take a price position. It supplies idle USDC to Aave v3, so its return is the pool\'s floating rate rather than a price path, and this deployment does not hold the historical rate series.',
  'drawdown-guard':
    'Drawdown Guard only closes positions. What it would have returned depends entirely on the book it was guarding, so there is no strategy return to measure independently of a portfolio.',
};

extra.get('/agents/:id/backtest', async (c) => {
  const lookback = (c.req.query('lookback') ?? '90d') as Lookback;
  // The AGENT, from the path. This was shadowed by the wallet lookup below and never read.
  const agentId = c.req.param('id');

  const reason = NOT_BACKTESTABLE[agentId];
  if (reason) return c.json({ error: 'not_backtestable', agent: agentId, message: reason }, 422);
  if (agentId !== 'momentum-scout') {
    return c.json(
      {
        error: 'unknown_agent',
        agent: agentId,
        message: `No agent "${agentId}" is on the roster.`,
      },
      404,
    );
  }

  /*
   * The cap this backtest sizes against comes from the chain, like every other statement the
   * product makes about a user's limits. The database copy is a cache of the last grant recorded
   * through us, and a backtest scaled to a cap the user no longer has is a chart of a strategy
   * they could not run. Falls back to the default only when there is no policy to read.
   */
  const w = await currentWallet(c).catch(() => null);
  const policy = w ? await readPolicy(w.address as Address).catch(() => null) : null;
  const cap = policy?.dailyCapUsd ?? 1600;

  /*
   * WETH, not SOL.
   *
   * The old default backtested a symbol this executor cannot settle — "liquid majors" means the
   * ones with a real route on Base. Backtesting an asset the strategy could never have bought is
   * the same class of error as backtesting the wrong strategy.
   */
  const symbol = c.req.query('symbol') ?? 'WETH';
  try {
    return c.json(
      await within(
        backtestMomentum({
          symbol,
          lookback,
          usdPerEntry: Number(c.req.query('perRun') ?? 500),
          dailyCapUsd: cap,
        }),
      ),
    );
  } catch (e) {
    if (e instanceof BacktestTooSlow) return warming(c);
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

/**
 * Every proposal this wallet has been shown, and what happened to it.
 *
 * The thread renders the CURRENT proposal and forgets the rest, so "what has it asked me for, and
 * what did I say" had no answer anywhere. That is the record of the approve-before-execute loop
 * working — and specifically of the ones that expired, which are the interesting rows: an expiry is
 * the bot asking and being ignored, which neither an approval nor a skip tells you.
 *
 * `payload` is the proposal as it was shown, stored at the time. Rendering today's prices against
 * yesterday's proposal would rewrite what was actually put in front of someone.
 */
extra.get('/proposals', async (c) => {
  const id = await walletId(c);
  if (!id) return c.json([]);
  const rows = await query<{
    id: string;
    agent: string;
    payload: Record<string, unknown>;
    expires_at: Date;
    decision: string | null;
    decided_at: Date | null;
    created_at: Date;
  }>(
    `SELECT id, agent, payload, expires_at, decision, decided_at, created_at
       FROM proposals WHERE wallet_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [id],
  );
  const now = Date.now();
  return c.json(
    rows.map((r) => ({
      id: r.id,
      agent: r.agent,
      payload: r.payload,
      /*
       * An undecided proposal past its expiry is expired, whether or not anything wrote that down.
       * The decision column is only set when someone acts or the thread notices; leaving those rows
       * as "awaiting" would show a queue of decisions nobody can make any more.
       */
      decision: r.decision ?? (r.expires_at.getTime() <= now ? 'expired' : null),
      decidedAt: r.decided_at ? r.decided_at.toISOString() : null,
      expiresAt: r.expires_at.toISOString(),
      at: r.created_at.toISOString(),
    })),
  );
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
  /*
   * No model, no text. `null`, not a written-in-advance line.
   *
   * This returned the persona's own bible line, and the chat client had to learn to ignore it —
   * its docblock records asking "why did the CBBTC buy fail?" and getting back "Nothing worth
   * chasing today. Ranges are thin and the tape is quiet." The client was fixed; the API kept
   * emitting the line, so every other caller still received a confident market remark that nothing
   * measured. `/briefing` was one of them, and it captioned three unrelated headlines with the
   * same sentence.
   *
   * The facts half of every message is rendered by the client from real records regardless, so an
   * absent voice segment costs a quip and never information.
   */
  return c.json({
    text: null,
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
      // Not `.toUpperCase()`: tokenized equities are `NVDAc`, `TSLAc`, and uppercasing them
      // produced a symbol the registry has never heard of — every equity quote 502'd.
      inSymbol: canonicalSymbol(c.req.query('in') ?? 'ETH'),
      outSymbol: canonicalSymbol(c.req.query('out') ?? 'USDC'),
      amount: Number(c.req.query('amount') ?? 1),
    });
    return c.json(q);
  } catch (e) {
    // No route is a real answer. The screen says so rather than showing a computed guess.
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});

// ── The Graph — the agent's reasoning surface ────────────────────────────────

/**
 * What the bot would decide right now, and why. Read straight from indexed chain data.
 *
 * `/graph/decision`, not `/agent/decision`. The old path made this route unreachable by anyone:
 * the auth middleware treats the `/agent/` prefix as the machine surface and demands an agent key,
 * while the handler needs a signed-in user's wallet. A Privy token got "this surface needs an agent
 * key"; an agent key got "this route belongs to a signed-in user". Both refusals were correct and
 * the route was dead between them.
 *
 * It regressed silently when the prefix guard was introduced — an earlier test plan records it
 * passing — because nothing calls it from the app. It is the surface a judge would use to see the
 * subgraph actually driving a decision, which is exactly the thing worth showing.
 *
 * `/graph/` is where the other subgraph reads already live, and it is a user route in fact as well
 * as in name: the decision is about the caller's own wallet.
 */
extra.get('/graph/decision', async (c) => {
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
    /*
     * The index's own state, and whether it is about THIS deployment.
     *
     * `_meta` alone says a subgraph is healthy and current, which is true and can still be
     * useless: a perfectly synced index of a different contract is worse than no index, because
     * it answers confidently about somebody else's policy. The screen has to be able to say which
     * of those it is looking at, so the description travels with the health.
     */
    const [meta, index] = [await graphHealth(), indexDescription()];
    return c.json({ ...meta, ...index });
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

/**
 * What a strategy WOULD have done, before you commit money to it.
 *
 * Agents had a backtest and strategies did not, which is backwards: an agent is a persona, and a
 * strategy is the thing that actually spends. For a grid it answers the question its own
 * description raises — the range holding is an assumption, and how often it held over the last
 * ninety days is a fact.
 */
/**
 * A backtest a person is waiting for, bounded — or an honest "not yet".
 *
 * `history()` fetches from CoinGecko through `http/get.ts`, which retries five times with
 * exponential backoff. That module's own docblock puts a slow host at "about twenty-five seconds",
 * and with a 15s timeout per attempt plus the outbound queue a COLD cache took over
 * **forty-five seconds** — measured right after a deploy, on `GET /agents/:id/backtest`, which is
 * the whole content of a screen.
 *
 * The retry ladder is right and stays: a scheduled run at 3am should wait patiently for a busy
 * upstream. A screen should not. So the bound is here, at the boundary where someone is watching,
 * and the answer when it is hit is the same "warming" 503 that `/market/ohlc` and `/perp/:symbol`
 * give — retryable, with a sentence, rather than a spinner that never resolves.
 */
const BACKTEST_BUDGET_MS = 12_000;

class BacktestTooSlow extends Error {}

async function within<T>(work: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new BacktestTooSlow()), BACKTEST_BUDGET_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    // The fetch keeps going in the background, so the next caller finds a warm cache.
    void work.catch(() => undefined);
  }
}

/** The 503 both backtest routes give when the history is still being fetched. */
function warming(c: Context) {
  c.header('retry-after', '5');
  return c.json(
    { error: 'warming', detail: 'The price history is still being fetched; try again in a moment.' },
    503,
  );
}

extra.post('/strategies/backtest', async (c) => {
  requireUser(c);
  const body = z
    .object({
      kind: z.enum(['dca', 'grid']),
      symbol: z.string().min(1),
      lookback: z.enum(['30d', '90d', '6m', '1y']).default('90d'),
      params: z.record(z.string(), z.unknown()).default({}),
    })
    .parse(await c.req.json());

  const p = body.params as Record<string, number>;
  try {
    if (body.kind === 'grid') {
      const lower = Number(p.lower);
      const upper = Number(p.upper);
      const steps = Math.floor(Number(p.steps ?? 4));
      const usdPerStep = Number(p.usdPerStep);
      if (!(lower > 0) || !(upper > lower) || !(steps >= 1) || !(usdPerStep > 0)) {
        return c.json({ error: 'invalid_range', message: 'A range needs a bottom below its top, at least one rung, and a size.' }, 400);
      }
      return c.json(
        await within(
          backtestGrid({ symbol: body.symbol, lookback: body.lookback as Lookback, lower, upper, steps, usdPerStep }),
        ),
      );
    }
    return c.json(
      await within(
        backtestDca({
          symbol: body.symbol,
          lookback: body.lookback as Lookback,
          perRunUsd: Number(p.usd ?? 50),
          dailyCapUsd: Number(p.dailyCapUsd ?? Number.MAX_SAFE_INTEGER),
          everyNDays: Number(p.everyNDays ?? 7),
        }),
      ),
    );
  } catch (e) {
    if (e instanceof BacktestTooSlow) return warming(c);
    // No history means no backtest. Inventing one would be the worst possible failure here.
    return c.json({ error: 'no_history', message: e instanceof Error ? e.message : String(e) }, 502);
  }
});
