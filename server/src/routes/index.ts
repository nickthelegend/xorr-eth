/**
 * The executor API — PLAN.md 12.1. Mirrors the client's repository interfaces one-to-one, so
 * swapping the app from fixtures to the server changes src/data/index.ts and nothing else.
 */
import { randomUUID } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { one, query, tx } from '../db/index.js';
import { append, exportTrail, list as listAudit, verify } from '../audit/log.js';
import { evaluate, spentToday } from '../rules/engine.js';
import { runStrategy, type StrategyRow } from '../executor/run.js';
import { nextRuns, type Cadence } from '../executor/schedule.js';
import { CHAIN_KEY, explorerTx, ADDRESSES } from '../evm/chains.js';
import { delegatePublicKey, readPolicy, waitForTx, DELEGATION_ADDRESS } from '../evm/delegation.js';
import { requireUser } from '../auth/middleware.js';
import type { Address, Hex } from 'viem';
import { priceOf } from '../market/prices.js';
import { totalValueUsd } from '../evm/balances.js';
import { TOKENS } from '../venues/oneinch.js';
import { getPosition, listPositions } from '../positions/index.js';

/**
 * Every wallet lookup is scoped to the AUTHENTICATED Privy user.
 *
 * The previous build read "the first wallet row", which was fine for one user on a laptop and
 * catastrophic for two: any caller could act on anyone's capital. Privy gives a verified user id
 * on every request and it is the key for everything below.
 */
type WalletRow = { id: string; address: string; kind: string; cluster: string; user_id: string };

async function currentWallet(c: Context) {
  const { userId } = requireUser(c);
  return one<WalletRow>(`SELECT * FROM wallets WHERE user_id = $1 LIMIT 1`, [userId]);
}

async function requireWallet(c: Context) {
  const w = await currentWallet(c);
  if (!w) throw new Error('No wallet for this user. POST /wallet/create first.');
  return w;
}

export const routes = new Hono();

routes.get('/health', async (c) => {
  const rows = await query<{ now: Date }>('SELECT now()');
  return c.json({ ok: true, db: rows[0]?.now, chain: CHAIN_KEY, delegation: DELEGATION_ADDRESS });
});

// ── Wallet ───────────────────────────────────────────────────────────────────

routes.get('/wallet', async (c) => c.json((await currentWallet(c)) ?? null));

routes.post('/wallet/create', async (c) => {
  const { userId, walletAddress } = requireUser(c);
  const existing = await currentWallet(c);
  if (existing) return c.json(existing);

  // Privy owns the embedded wallet, so the address comes from the verified identity rather than
  // from a keypair this server generated. The user's keys never touch the executor.
  const body = (await c.req.json().catch(() => ({}))) as { address?: string };
  const address = walletAddress ?? body.address;
  if (!address) {
    return c.json(
      {
        error: 'no_wallet',
        message: 'No embedded wallet on this Privy account yet. Create one in the app first.',
      },
      400,
    );
  }

  const row = await one<WalletRow>(
    `INSERT INTO wallets (id, user_id, address, kind, cluster) VALUES ($1,$2,$3,'embedded',$4)
     ON CONFLICT (address) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING *`,
    [randomUUID(), userId, address, CHAIN_KEY],
  );
  await append({
    walletId: row!.id,
    agent: 'xorr',
    action: 'Wallet connected',
    detail: `Your keys, held by you. ${CHAIN_KEY}.`,
    kind: 'risk',
  });
  return c.json(row);
});

routes.post('/wallet/connect', async (c) => {
  const { userId } = requireUser(c);
  const body = z.object({ address: z.string().regex(/^0x[a-fA-F0-9]{40}$/) }).parse(await c.req.json());
  const row = await one<WalletRow>(
    `INSERT INTO wallets (id, user_id, address, kind, cluster) VALUES ($1,$2,$3,'connected',$4)
     ON CONFLICT (address) DO UPDATE SET kind='connected', user_id = EXCLUDED.user_id RETURNING *`,
    [randomUUID(), userId, body.address, CHAIN_KEY],
  );
  return c.json(row);
});

routes.get('/wallet/balance', async (c) => {
  const w = await currentWallet(c);
  if (!w) return c.json({ usd: 0 });
  const [policy, value] = await Promise.all([
    readPolicy(w.address as Address).catch(() => null),
    // Read the chain. This used to be a hardcoded 0, so the home screen said "$0.00" while the
    // wallet held a real position.
    totalValueUsd(w.address as Address).catch((e: unknown) => {
      // A zero that came from a failed read looks exactly like a zero balance. Say which.
      console.error('[balance] chain read failed:', e instanceof Error ? e.message : e);
      return { cash: 0, holdings: [], total: 0 };
    }),
  ]);
  // Balance is what the user holds; the policy tells us what the bot may touch of it.
  return c.json({
    usd: value.total,
    cashUsd: value.cash,
    holdings: value.holdings,
    dailyCapUsd: policy?.dailyCapUsd ?? 0,
    remainingTodayUsd: policy?.remainingTodayUsd ?? 0,
  });
});

// ── Delegation ───────────────────────────────────────────────────────────────

routes.get('/delegation', async (c) => {
  const w = await currentWallet(c);
  if (!w) return c.json(null);
  const policy = await readPolicy(w.address as Address).catch(() => null);
  if (!policy) return c.json(null);
  return c.json({
    delegatePubkey: policy.delegate,
    ownerPubkey: w.address,
    dailyCapUsd: policy.dailyCapUsd,
    expiresAt: policy.expiresAt,
    venueAllowlist: [ADDRESSES.oneInchRouter],
    withdrawalAllowlist: [],
    revoked: policy.revoked,
    onChainRemainingUsd: policy.remainingTodayUsd,
    spentTodayUsd: policy.spentTodayUsd,
  });
});

/**
 * The parameters the app needs to build the grant transaction.
 *
 * The USER signs the grant, with their own Privy wallet — the executor never holds the owner key
 * and so cannot grant itself permission. This route only says what to sign.
 */
routes.get('/delegation/params', async (c) => {
  requireUser(c);
  return c.json({
    contract: DELEGATION_ADDRESS,
    delegate: delegatePublicKey,
    venues: [ADDRESSES.oneInchRouter],
    token: ADDRESSES.usdcBase,
    chain: CHAIN_KEY,
  });
});

/** Record a grant the user already signed, so the audit trail has it. */
routes.post('/delegation/record', async (c) => {
  const body = z
    .object({ txHash: z.string(), dailyCapUsd: z.number().positive(), expiresAt: z.number() })
    .parse(await c.req.json());
  const w = await requireWallet(c);

  /*
   * Wait for the transaction the client says it sent, THEN read the chain.
   *
   * `eth_sendTransaction` returns as soon as the tx is broadcast, so reading the policy straight
   * away raced the block: the grant was genuinely on its way, the read came back empty, and the
   * record was refused with "not granted on-chain" — for a grant that landed a second later. The
   * trust model is unchanged; we still believe only what the chain says, we just let it say it.
   */
  await waitForTx(body.txHash as Hex).catch(() => undefined);

  const policy = await readPolicy(w.address as Address);
  if (!policy || policy.revoked) {
    // Trust the CHAIN, not the client's claim that it signed something.
    return c.json({ error: 'not_granted_on_chain', message: 'No active policy found on-chain.' }, 400);
  }

  await one(
    `INSERT INTO delegations (id, wallet_id, owner_pubkey, delegate_pubkey, daily_cap_usd, expires_at, venue_allowlist, grant_signature)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      randomUUID(),
      w.id,
      w.address,
      policy.delegate,
      policy.dailyCapUsd,
      new Date(policy.expiresAt),
      [ADDRESSES.oneInchRouter],
      body.txHash,
    ],
  );

  await append({
    walletId: w.id,
    agent: 'xorr',
    action: 'Trading permission granted',
    detail: `Up to $${policy.dailyCapUsd.toLocaleString('en-US')} a day, expiring ${new Date(policy.expiresAt).toDateString()}.`,
    kind: 'risk',
    signature: body.txHash,
    payload: { explorer: explorerTx(body.txHash) },
  });

  return c.json({ ok: true, ...policy });
});

/** Record a revoke the user already signed. */
routes.post('/delegation/revoke', async (c) => {
  const body = z.object({ txHash: z.string().optional() }).parse(await c.req.json().catch(() => ({})));
  const w = await requireWallet(c);

  const policy = await readPolicy(w.address as Address);
  if (policy && !policy.revoked) {
    return c.json(
      { error: 'still_active', message: 'The policy is still active on-chain. Sign the revoke first.' },
      400,
    );
  }

  await tx(async (client) => {
    await client.query(
      `UPDATE delegations SET revoked=true, revoke_signature=$2 WHERE wallet_id=$1 AND revoked=false`,
      [w.id, body.txHash ?? null],
    );
    await append(
      {
        walletId: w.id,
        agent: 'xorr',
        action: 'All agents stopped',
        detail: 'Permission revoked on-chain. Open positions are untouched.',
        kind: 'risk',
        signature: body.txHash,
      },
      client,
    );
  });

  return c.json({ revoked: true, ownerPubkey: w.address, dailyCapUsd: 0 });
});

// ── Strategies ───────────────────────────────────────────────────────────────

const StrategyInput = z.object({
  kind: z.string(),
  state: z.enum(['draft', 'watch', 'live', 'paused', 'ended']),
  label: z.string(),
  /**
   * Must be a symbol the executor can actually route and settle. The UI already only offers these,
   * but the API is the boundary that matters: without this check a client could create a strategy
   * that schedules forever and fails every run, and the failure would look like our bug rather
   * than an impossible request.
   */
  symbol: z
    .string()
    .refine((v) => v.toUpperCase() in TOKENS || v in TOKENS, {
      message: `not tradable on this chain — one of: ${Object.keys(TOKENS).join(', ')}`,
    }),
  params: z.record(z.string(), z.unknown()).default({}),
  cadence: z.enum(['daily', 'weekly', 'biweekly', 'monthly']).optional(),
  nextRunAt: z.number().optional(),
  dailyAllocationUsd: z.number().nonnegative(),
  /** Which hired agent runs this. Optional: a user can set a strategy up themselves. */
  agentId: z.string().uuid().optional(),
});

function toApi(r: StrategyRow) {
  return {
    id: r.id,
    kind: r.kind,
    state: r.state,
    label: r.label,
    symbol: r.symbol,
    params: r.params,
    cadence: r.cadence ?? undefined,
    nextRunAt: r.next_run_at ? new Date(r.next_run_at).getTime() : undefined,
    dailyAllocationUsd: Number(r.daily_allocation_usd),
    createdAt: Date.now(),
  };
}

routes.get('/strategies', async (c) => {
  const w = await currentWallet(c);
  if (!w) return c.json([]);
  const rows = await query<StrategyRow>(
    `SELECT * FROM strategies WHERE wallet_id=$1 ORDER BY created_at DESC`,
    [w.id],
  );
  return c.json(rows.map(toApi));
});

/**
 * Run one strategy now.
 *
 * A cadence is the point of the product, but it is useless for showing someone what the bot does:
 * "come back on Sunday" is not a demo, and it is not a way to test a change either. This runs the
 * same `runStrategy` the scheduler runs, with the same period claim — so triggering it twice in a
 * period is a no-op rather than a double buy, which is the property that makes it safe to expose.
 */
routes.post('/strategies/:id/run', async (c) => {
  const w = await requireWallet(c);
  const row = await one<StrategyRow>(
    `SELECT * FROM strategies WHERE id = $1 AND wallet_id = $2`,
    [c.req.param('id'), w.id],
  );
  // Scoped to the caller's own wallet: an id from another user must look like a missing strategy,
  // not like a permission error, because the latter confirms it exists.
  if (!row) return c.json({ error: 'not_found' }, 404);

  const outcome = await runStrategy(row);
  return c.json(outcome, outcome.status === 'failed' ? 502 : 200);
});

routes.post('/strategies', async (c) => {
  const body = StrategyInput.parse(await c.req.json());
  const w = await requireWallet(c);

  /*
   * PLAN.md 9.2: the sum of live strategies can never exceed the delegation's daily cap, enforced
   * at CREATION so a user cannot quietly over-commit by adding one more.
   *
   * Read from the CHAIN. This used to read a `delegations` row written by /delegation/record, and
   * a row that was never written meant `del` was null and the whole check was skipped — a wallet
   * with a real $1,600 on-chain cap accepted a $999,999/day strategy, because the guard's failure
   * mode was to wave everything through. Absent permission has to mean refuse, not allow.
   */
  const policy = await readPolicy(w.address as Address);
  if (!policy || policy.revoked) {
    return c.json(
      {
        error: 'no_delegation',
        message: 'No active trading permission on-chain. Grant one before creating a strategy.',
      },
      400,
    );
  }
  if (policy.expiresAt <= Date.now()) {
    return c.json(
      { error: 'delegation_expired', message: 'The trading permission has expired. Renew it first.' },
      400,
    );
  }

  const sums = await query<{ sum: string | null }>(
    `SELECT SUM(daily_allocation_usd) AS sum FROM strategies WHERE wallet_id=$1 AND state IN ('live','watch')`,
    [w.id],
  );
  const committed = Number(sums[0]?.sum ?? 0) + body.dailyAllocationUsd;
  if (committed > policy.dailyCapUsd) {
    return c.json(
      {
        error: 'over_cap',
        message: `That would commit $${committed.toLocaleString('en-US')} a day against a $${policy.dailyCapUsd.toLocaleString('en-US')} cap. Raise the cap or lower this strategy.`,
      },
      400,
    );
  }

  const nextRunAt = body.nextRunAt
    ? new Date(body.nextRunAt)
    : body.cadence
      ? nextRuns(body.cadence as Cadence, 1)[0]!
      : null;

  // An agent id from another wallet must not be attachable. Verified here rather than trusted,
  // because the alternative is a strategy that reports to an agent its owner cannot see or fire.
  let agentId: string | null = null;
  let agentName = 'Yield Keeper';
  if (body.agentId) {
    const agent = await one<{ id: string; name: string }>(
      `SELECT id, name FROM agents WHERE id = $1 AND wallet_id = $2 AND hired = true`,
      [body.agentId, w.id],
    );
    if (!agent) {
      return c.json(
        { error: 'unknown_agent', message: 'That agent is not one you have hired.' },
        400,
      );
    }
    agentId = agent.id;
    agentName = agent.name;
  }

  const row = await one<StrategyRow>(
    `INSERT INTO strategies (id, wallet_id, kind, state, label, symbol, params, cadence, next_run_at, daily_allocation_usd, agent_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      randomUUID(),
      w.id,
      body.kind,
      body.state,
      body.label,
      body.symbol,
      JSON.stringify(body.params),
      body.cadence ?? null,
      nextRunAt,
      body.dailyAllocationUsd,
      agentId,
    ],
  );

  await append({
    walletId: w.id,
    agent: agentName,
    action: `Created ${body.label}`,
    detail: nextRunAt ? `First run ${nextRunAt.toDateString()}.` : 'Ready to run.',
    kind: 'risk',
    payload: { strategyId: row!.id },
  });

  return c.json(toApi(row!));
});

for (const [path, state] of [
  ['pause', 'paused'],
  ['resume', 'live'],
  ['end', 'ended'],
] as const) {
  routes.post(`/strategies/:id/${path}`, async (c) => {
    const id = c.req.param('id');
    const row = await one<StrategyRow>(
      `UPDATE strategies SET state=$2 WHERE id=$1 RETURNING *`,
      [id, state],
    );
    if (!row) return c.json({ error: 'not_found' }, 404);
    return c.json(toApi(row));
  });
}

/** Run a strategy now. Idempotent per period — a second call in the same period is a no-op. */
routes.post('/strategies/:id/run', async (c) => {
  const row = await one<StrategyRow>(`SELECT * FROM strategies WHERE id=$1`, [c.req.param('id')]);
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json(await runStrategy(row));
});

// ── Activity / audit ─────────────────────────────────────────────────────────

routes.get('/positions', async (c) => {
  const w = await currentWallet(c);
  if (!w) return c.json([]);
  return c.json(await listPositions(w.id));
});

routes.get('/positions/:id', async (c) => {
  const w = await requireWallet(c);
  const p = await getPosition(w.id, c.req.param('id'));
  return p ? c.json(p) : c.json({ error: 'not_found' }, 404);
});

routes.get('/activity', async (c) => {
  const w = await currentWallet(c);
  if (!w) return c.json([]);
  const rows = await listAudit(w.id);
  return c.json(
    rows.map((r) => ({
      id: String(r.seq),
      t: new Date(r.at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      agent: r.agent,
      action: r.action,
      detail: r.detail,
      amount: r.amount,
      kind: r.kind,
      signature: r.signature ?? undefined,
    })),
  );
});

routes.get('/activity/export', async (c) => {
  const w = await requireWallet(c);
  const format = c.req.query('format') === 'json' ? 'json' : 'csv';
  const body = await exportTrail(w.id, format);
  return c.text(body, 200, {
    'content-type': format === 'json' ? 'application/json' : 'text/csv',
    'content-disposition': `attachment; filename="xorr-audit.${format}"`,
  });
});

routes.get('/activity/verify', async (c) => {
  const w = await requireWallet(c);
  return c.json(await verify(w.id));
});

// ── Limits ───────────────────────────────────────────────────────────────────

routes.get('/limits', async (c) => {
  const w = await requireWallet(c);
  const del = await one<{ daily_cap_usd: string; expires_at: Date; revoked: boolean }>(
    `SELECT daily_cap_usd, expires_at, revoked FROM delegations WHERE wallet_id=$1 ORDER BY created_at DESC LIMIT 1`,
    [w.id],
  );
  const spent = await spentToday(w.id);
  return c.json({
    dailyCapUsd: del ? Number(del.daily_cap_usd) : 0,
    spentTodayUsd: spent,
    remainingUsd: del ? Number(del.daily_cap_usd) - spent : 0,
    revoked: del?.revoked ?? true,
  });
});

routes.post('/limits/check', async (c) => {
  const body = z.object({ usd: z.number() }).parse(await c.req.json());
  const w = await requireWallet(c);
  const del = await one<{ daily_cap_usd: string; expires_at: Date; revoked: boolean }>(
    `SELECT daily_cap_usd, expires_at, revoked FROM delegations WHERE wallet_id=$1 ORDER BY created_at DESC LIMIT 1`,
    [w.id],
  );
  if (!del) return c.json({ allowed: false, reason: 'no_delegation', detail: 'No permission granted.' });
  return c.json(
    await evaluate({
      walletId: w.id,
      usd: body.usd,
      dailyCapUsd: Number(del.daily_cap_usd),
      delegationExpiresAt: new Date(del.expires_at),
      delegationRevoked: del.revoked,
    }),
  );
});

// ── Prices ───────────────────────────────────────────────────────────────────

routes.get('/price/:symbol', async (c) => {
  const symbol = c.req.param('symbol').toUpperCase();
  try {
    return c.json({ symbol, price: await priceOf(symbol), source: 'coingecko' });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});
