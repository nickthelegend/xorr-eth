/**
 * The executor API — PLAN.md 12.1. Mirrors the client's repository interfaces one-to-one, so
 * swapping the app from fixtures to the server changes src/data/index.ts and nothing else.
 */
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { PublicKey } from '@solana/web3.js';
import { z } from 'zod';
import { one, query, tx } from '../db/index.js';
import { append, exportTrail, list as listAudit, verify } from '../audit/log.js';
import { evaluate, spentToday } from '../rules/engine.js';
import { runStrategy, type StrategyRow } from '../executor/run.js';
import { nextRuns, type Cadence } from '../executor/schedule.js';
import { CLUSTER, explorerTx } from '../solana/connection.js';
import { delegateKeypair, devOwnerKeypair } from '../solana/keys.js';
import { readState, setupDevnet, DECIMALS } from '../solana/setup.js';
import {
  approveDelegate,
  baseUnitsToUsd,
  readDelegation,
  revokeDelegate,
  usdToBaseUnits,
} from '../solana/delegation.js';
import { priceOf } from '../market/prices.js';
import { getPosition, listPositions } from '../positions/index.js';

/**
 * Single-user dev server: one wallet row, keyed by the devnet owner. Multi-tenant auth is
 * PLAN.md 11.3 and is not pretended at here — the route reads the one wallet rather than
 * inventing a session that does not exist.
 */
async function currentWallet() {
  return one<{ id: string; address: string; kind: string; cluster: string }>(
    `SELECT * FROM wallets ORDER BY created_at ASC LIMIT 1`,
  );
}

async function requireWallet() {
  const w = await currentWallet();
  if (!w) throw new Error('No wallet. POST /wallet/create first.');
  return w;
}

export const routes = new Hono();

routes.get('/health', async (c) => {
  const rows = await query<{ now: Date }>('SELECT now()');
  return c.json({ ok: true, db: rows[0]?.now, cluster: CLUSTER });
});

// ── Wallet ───────────────────────────────────────────────────────────────────

routes.get('/wallet', async (c) => c.json((await currentWallet()) ?? null));

routes.post('/wallet/create', async (c) => {
  const existing = await currentWallet();
  if (existing) return c.json(existing);
  const state = readState() ?? (await setupDevnet());
  const row = await one<{ id: string; address: string; kind: string; cluster: string }>(
    `INSERT INTO wallets (id, address, kind, cluster) VALUES ($1,$2,'embedded',$3) RETURNING *`,
    [randomUUID(), state.ownerPubkey, CLUSTER],
  );
  await append({
    walletId: row!.id,
    agent: 'xorr',
    action: 'Wallet created',
    detail: `Keys are yours. ${CLUSTER}.`,
    kind: 'risk',
  });
  return c.json(row);
});

routes.post('/wallet/connect', async (c) => {
  const body = z.object({ address: z.string().min(32) }).parse(await c.req.json());
  const row = await one(
    `INSERT INTO wallets (id, address, kind, cluster) VALUES ($1,$2,'connected',$3)
     ON CONFLICT (address) DO UPDATE SET kind='connected' RETURNING *`,
    [randomUUID(), body.address, CLUSTER],
  );
  return c.json(row);
});

routes.get('/wallet/balance', async (c) => {
  const state = readState();
  if (!state) return c.json({ sol: 0, usd: 0 });
  const d = await readDelegation(new PublicKey(state.ownerTokenAccount));
  return c.json({ sol: 0, usd: baseUnitsToUsd(d.amount, DECIMALS) });
});

// ── Delegation ───────────────────────────────────────────────────────────────

routes.get('/delegation', async (c) => {
  const w = await currentWallet();
  if (!w) return c.json(null);
  const row = await one(
    `SELECT * FROM delegations WHERE wallet_id=$1 ORDER BY created_at DESC LIMIT 1`,
    [w.id],
  );
  if (!row) return c.json(null);
  // Reconcile against the chain: the chain is the truth, our row is a cache.
  const state = readState();
  const chain = state ? await readDelegation(new PublicKey(state.ownerTokenAccount)) : null;
  return c.json({
    delegatePubkey: row.delegate_pubkey,
    ownerPubkey: row.owner_pubkey,
    dailyCapUsd: Number(row.daily_cap_usd),
    expiresAt: new Date(row.expires_at).getTime(),
    venueAllowlist: row.venue_allowlist,
    withdrawalAllowlist: row.withdrawal_allowlist,
    revoked: row.revoked || !chain?.delegate,
    signature: row.grant_signature,
    onChainRemainingUsd: chain ? baseUnitsToUsd(chain.delegatedAmount, DECIMALS) : null,
  });
});

routes.post('/delegation/grant', async (c) => {
  const body = z
    .object({ dailyCapUsd: z.number().positive().max(5000), durationMs: z.number().positive() })
    .parse(await c.req.json());
  const w = await requireWallet();
  const state = readState() ?? (await setupDevnet());

  const signature = await approveDelegate({
    owner: devOwnerKeypair(),
    ownerTokenAccount: new PublicKey(state.ownerTokenAccount),
    delegate: delegateKeypair().publicKey,
    amount: usdToBaseUnits(body.dailyCapUsd, DECIMALS),
  });

  const expiresAt = new Date(Date.now() + body.durationMs);
  const row = await one(
    `INSERT INTO delegations (id, wallet_id, owner_pubkey, delegate_pubkey, daily_cap_usd, expires_at, venue_allowlist, grant_signature)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      randomUUID(),
      w.id,
      state.ownerPubkey,
      state.delegatePubkey,
      body.dailyCapUsd,
      expiresAt,
      [state.venueTokenAccount],
      signature,
    ],
  );

  await append({
    walletId: w.id,
    agent: 'xorr',
    action: 'Trading permission granted',
    detail: `Up to $${body.dailyCapUsd.toLocaleString('en-US')} a day, expiring ${expiresAt.toDateString()}.`,
    kind: 'risk',
    signature,
    payload: { explorer: explorerTx(signature) },
  });

  return c.json({
    delegatePubkey: row!.delegate_pubkey,
    ownerPubkey: row!.owner_pubkey,
    dailyCapUsd: Number(row!.daily_cap_usd),
    expiresAt: expiresAt.getTime(),
    venueAllowlist: row!.venue_allowlist,
    withdrawalAllowlist: row!.withdrawal_allowlist,
    revoked: false,
    signature,
  });
});

routes.post('/delegation/revoke', async (c) => {
  const w = await requireWallet();
  const state = readState();
  if (!state) throw new Error('Chain accounts are not set up.');

  const signature = await revokeDelegate({
    owner: devOwnerKeypair(),
    ownerTokenAccount: new PublicKey(state.ownerTokenAccount),
  });

  await tx(async (client) => {
    await client.query(
      `UPDATE delegations SET revoked=true, revoke_signature=$2 WHERE wallet_id=$1 AND revoked=false`,
      [w.id, signature],
    );
    await append(
      {
        walletId: w.id,
        agent: 'xorr',
        action: 'All agents stopped',
        detail: 'Permission revoked on-chain. Open positions are untouched.',
        kind: 'risk',
        signature,
        payload: { explorer: explorerTx(signature) },
      },
      client,
    );
  });

  const chain = await readDelegation(new PublicKey(state.ownerTokenAccount));
  return c.json({
    delegatePubkey: state.delegatePubkey,
    ownerPubkey: state.ownerPubkey,
    dailyCapUsd: 0,
    expiresAt: Date.now(),
    venueAllowlist: [],
    withdrawalAllowlist: [],
    revoked: chain.delegate === null,
    signature,
  });
});

// ── Strategies ───────────────────────────────────────────────────────────────

const StrategyInput = z.object({
  kind: z.string(),
  state: z.enum(['draft', 'watch', 'live', 'paused', 'ended']),
  label: z.string(),
  symbol: z.string(),
  params: z.record(z.string(), z.unknown()).default({}),
  cadence: z.enum(['daily', 'weekly', 'biweekly', 'monthly']).optional(),
  nextRunAt: z.number().optional(),
  dailyAllocationUsd: z.number().nonnegative(),
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
  const w = await currentWallet();
  if (!w) return c.json([]);
  const rows = await query<StrategyRow>(
    `SELECT * FROM strategies WHERE wallet_id=$1 ORDER BY created_at DESC`,
    [w.id],
  );
  return c.json(rows.map(toApi));
});

routes.post('/strategies', async (c) => {
  const body = StrategyInput.parse(await c.req.json());
  const w = await requireWallet();

  // PLAN.md 9.2: the sum of live strategies can never exceed the delegation's daily cap,
  // enforced at CREATION so a user cannot quietly over-commit by adding one more.
  const del = await one<{ daily_cap_usd: string }>(
    `SELECT daily_cap_usd FROM delegations WHERE wallet_id=$1 AND revoked=false ORDER BY created_at DESC LIMIT 1`,
    [w.id],
  );
  if (del) {
    const sums = await query<{ sum: string | null }>(
      `SELECT SUM(daily_allocation_usd) AS sum FROM strategies WHERE wallet_id=$1 AND state IN ('live','watch')`,
      [w.id],
    );
    const committed = Number(sums[0]?.sum ?? 0) + body.dailyAllocationUsd;
    if (committed > Number(del.daily_cap_usd)) {
      return c.json(
        {
          error: 'over_cap',
          message: `That would commit $${committed.toLocaleString('en-US')} a day against a $${Number(del.daily_cap_usd).toLocaleString('en-US')} cap. Raise the cap or lower this strategy.`,
        },
        400,
      );
    }
  }

  const nextRunAt = body.nextRunAt
    ? new Date(body.nextRunAt)
    : body.cadence
      ? nextRuns(body.cadence as Cadence, 1)[0]!
      : null;

  const row = await one<StrategyRow>(
    `INSERT INTO strategies (id, wallet_id, kind, state, label, symbol, params, cadence, next_run_at, daily_allocation_usd)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
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
    ],
  );

  await append({
    walletId: w.id,
    agent: 'Yield Keeper',
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
  const w = await currentWallet();
  if (!w) return c.json([]);
  return c.json(await listPositions(w.id));
});

routes.get('/positions/:id', async (c) => {
  const w = await requireWallet();
  const p = await getPosition(w.id, c.req.param('id'));
  return p ? c.json(p) : c.json({ error: 'not_found' }, 404);
});

routes.get('/activity', async (c) => {
  const w = await currentWallet();
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
  const w = await requireWallet();
  const format = c.req.query('format') === 'json' ? 'json' : 'csv';
  const body = await exportTrail(w.id, format);
  return c.text(body, 200, {
    'content-type': format === 'json' ? 'application/json' : 'text/csv',
    'content-disposition': `attachment; filename="xorr-audit.${format}"`,
  });
});

routes.get('/activity/verify', async (c) => {
  const w = await requireWallet();
  return c.json(await verify(w.id));
});

// ── Limits ───────────────────────────────────────────────────────────────────

routes.get('/limits', async (c) => {
  const w = await requireWallet();
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
  const w = await requireWallet();
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
