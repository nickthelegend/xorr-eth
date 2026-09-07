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
import {
  runStrategy,
  CLOSE_ONLY_KINDS,
  EXECUTABLE_KINDS,
  SELF_SIZING_KINDS,
  type StrategyRow,
} from '../executor/run.js';
import { TOKENS as VENUE_TOKENS, canonicalSymbol } from '../venues/oneinch.js';
import { nextRuns, type Cadence } from '../executor/schedule.js';
import { ADDRESSES, CHAIN_KEY, IS_BASE_MAINNET_STATE, SETTLEMENT_VENUES, explorerTx } from '../evm/chains.js';
import { basenameOf } from '../evm/basename.js';
import {
  allowedVenues,
  delegatePublicKey,
  readPolicy,
  waitForTx,
  DELEGATION_ADDRESS,
} from '../evm/delegation.js';
import { requireUser } from '../auth/middleware.js';
import { erc20Abi } from 'viem';
import type { Address, Hex } from 'viem';
import { priceOf } from '../market/prices.js';
import { totalValueUsd } from '../evm/balances.js';
import { TOKENS } from '../venues/oneinch.js';
import { publicClient } from '../evm/client.js';
import { STOCKS } from '../venues/stocks.js';
import { getPosition, listPositions, realisedPnl } from '../positions/index.js';
import { PUSH_KINDS } from '../notifications/push.js';

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

// `/health` moved to routes/ops.ts, where it checks the dependencies rather than only proving the
// process can still answer a request.

// ── Wallet ───────────────────────────────────────────────────────────────────

routes.get('/wallet', async (c) => {
  const w = await currentWallet(c);
  if (!w) return c.json(null);
  /*
   * `cluster` is where the wallet was CREATED. `chain` is where the executor is settling now.
   *
   * They are different facts and the screen was showing the first while meaning the second — so a
   * wallet created on Sepolia and now trading a Base fork reported "base-sepolia" underneath live
   * Base balances. The stored value is history and stays; the live one is what a user is asking
   * about when they look at this line.
   */
  return c.json({ ...w, chain: CHAIN_KEY });
});

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
      return { cash: 0, holdings: [], supplied: 0, total: 0 };
    }),
  ]);
  // Balance is what the user holds; the policy tells us what the bot may touch of it.
  return c.json({
    usd: value.total,
    cashUsd: value.cash,
    /*
     * `raw` is dropped on the way out.
     *
     * It is a bigint, which JSON cannot serialise, and the client has no use for wei — it displays
     * units and dollars. It exists so the SERVER can close a whole position exactly.
     */
    holdings: value.holdings.map(({ symbol, units, usd }) => ({ symbol, units, usd })),
    /** USDC earning yield on Aave. Part of the total, but not spendable until withdrawn. */
    suppliedUsd: value.supplied,
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
  /*
   * What the user ACTUALLY allowed, asked of the contract.
   *
   * This was the list we would have asked them to sign, which is a different question and answers
   * it wrongly for anyone who granted before a venue was added — the safety screen would have
   * shown them a permission they never gave. The chain knows; ask it.
   */
  const allowed = await allowedVenues(w.address as Address).catch(() => []);
  /*
   * Who the two parties actually are, in words.
   *
   * This screen's whole subject is "who may do what with your money", and it named both parties
   * with truncated hex. Two addresses that differ only in the middle look identical truncated,
   * which is the one place that matters. Basenames are Base's own answer and resolving one is a
   * read of a Base contract — null where there is no name, which is most addresses.
   */
  const [ownerName, delegateName] = await Promise.all([
    basenameOf(w.address as Address),
    basenameOf(policy.delegate as Address),
  ]);
  return c.json({
    delegatePubkey: policy.delegate,
    delegateName,
    /*
     * Does this permission name the key we sign with?
     *
     * If it does not, the grant is inert: `spend` compares `msg.sender` to the delegate the user
     * signed for, so every run reverts and nothing else about the policy looks wrong. The client
     * cannot work this out on its own — it never sees the executor's key — so it is answered here
     * rather than left to a screen that would otherwise report LIVE for a bot that cannot trade.
     */
    delegateIsCurrent:
      policy.delegate.toLowerCase() === delegatePublicKey.toLowerCase(),
    ownerPubkey: w.address,
    ownerName,
    dailyCapUsd: policy.dailyCapUsd,
    expiresAt: policy.expiresAt,
    venueAllowlist: allowed,
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

/**
 * The tokens worth asking the user to approve — and no more.
 *
 * Approving every entry in the routing registry meant ELEVEN modals before the grant: the user
 * tapped Approve a dozen times to finish onboarding, and eight of those were Ondo equities that
 * have no code on Base Sepolia at all. An approval for a contract that does not exist is a
 * transaction that costs gas and grants nothing.
 *
 * So: the settlement token, plus every registry token that actually has code on the chain we
 * settle on. On Sepolia that is three signatures instead of eleven; on mainnet or a fork it is the
 * full set, which is correct there because those contracts are real and sellable.
 *
 * Checked with `eth_getCode` rather than assumed from a chain flag, because the whole point of the
 * two-environment split is that the answer differs and the chain is the one that knows.
 */
async function approvableTokens(): Promise<{ symbol: string; address: Address }[]> {
  /*
   * SETTLEMENT addresses, not quote addresses.
   *
   * `TOKENS` is the routing registry and it is always Base MAINNET — 1inch is only ever asked
   * about mainnet, which is why `QUOTE_ADDRESSES` exists. Approving from it on Sepolia asked the
   * user to approve mainnet USDC, which has no code there, so the filter below removed it and the
   * list came back as WETH alone: the one token that happens to share an address across both.
   * The user would then have granted a permission that could never pull the token it spends.
   *
   * `ADDRESSES` follows `XORR_CHAIN`, so this is what the delegation will actually be asked to
   * move. The equities are added only where they exist, which `IS_BASE_MAINNET_STATE` already
   * answers and `getCode` then confirms.
   */
  const settlement: [string, Address][] = [
    ['USDC', ADDRESSES.usdcBase],
    ['WETH', ADDRESSES.wethBase],
    ['CBBTC', ADDRESSES.cbbtcBase],
    ...(IS_BASE_MAINNET_STATE
      ? Object.values(STOCKS).map((st) => [st.symbol, st.address] as [string, Address])
      : []),
  ];
  const entries = settlement;
  const codes = await Promise.all(
    entries.map(([, address]) => publicClient.getCode({ address }).catch(() => undefined)),
  );
  return entries
    .filter((_, i) => (codes[i]?.length ?? 0) > 2)
    .map(([symbol, address]) => ({ symbol, address }));
}

/**
 * GET /approvals — what the delegation contract is currently allowed to pull, per token.
 *
 * The grant approves each tradable token for MAX_UINT256, which is what makes a fill possible
 * without a second signature per trade. It is also, on its own, an unlimited standing allowance
 * that nothing in the product ever showed and nothing could take back. Revoking the DELEGATION
 * stops the bot — `spend` checks the policy — but the ERC-20 approvals survive it, so a wallet
 * whose owner believed they had fully disengaged still had live allowances to a contract.
 *
 * Read from the token contracts rather than from our record of what we asked the user to sign:
 * an allowance the user set elsewhere, or revoked elsewhere, is the truth and our record is not.
 */
routes.get('/approvals', async (c) => {
  const w = await requireWallet(c);
  const owner = w.address as Address;
  const tokens = await approvableTokens();
  const allowances = await Promise.all(
    tokens.map((t) =>
      publicClient
        .readContract({
          address: t.address,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [owner, DELEGATION_ADDRESS],
        })
        .catch(() => 0n),
    ),
  );
  const MAX = (1n << 256n) - 1n;
  return c.json({
    spender: DELEGATION_ADDRESS,
    tokens: tokens.map((t, i) => ({
      symbol: t.symbol,
      address: t.address,
      /*
       * A string, because this is a uint256 and JSON has no such thing.
       *
       * Sending it as a number silently rounds MAX_UINT256 to 1.157920892373162e+77, and a
       * screen comparing that to anything is comparing a lie.
       */
      allowance: (allowances[i] ?? 0n).toString(),
      unlimited: (allowances[i] ?? 0n) === MAX,
      none: (allowances[i] ?? 0n) === 0n,
    })),
  });
});

routes.get('/delegation/params', async (c) => {
  requireUser(c);
  return c.json({
    contract: DELEGATION_ADDRESS,
    delegate: delegatePublicKey,
    venues: SETTLEMENT_VENUES,
    token: ADDRESSES.usdcBase,
    /*
     * EVERY token the delegation may need to pull, not just the one it spends.
     *
     * The grant approved USDC alone, which is the buy side. `closePosition` pulls the asset being
     * SOLD, so with no WETH allowance the contract's `transferFrom` reverted with "pull failed" —
     * and that is every exit: take-profit, stop-loss, trailing, the panic flatten and the position
     * screen's own Close button. A wallet could be bought into and never sold out of, and the only
     * symptom was a generic "the transaction did not go through".
     *
     * Native ETH is excluded: it has no allowance to give, and the delegation trades the wrapped
     * form. The list follows the routing registry, so a token that becomes tradable becomes
     * approvable in the same change rather than two releases later.
     */
    tokens: await approvableTokens(),
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
  /**
   * A kind the executor can actually run.
   *
   * Same argument as `symbol` below, and it was missing for the same reason — the UI only offers
   * buildable tiers, so nothing ever sent a bad one. But the API is the boundary: `kind: 'grid'`
   * was accepted, scheduled forever, and blocked at every single run with "nothing here knows how
   * to run a grid strategy". A strategy that can never act should be refused when it is created,
   * while there is still someone to tell.
   */
  kind: z.string().refine((v) => EXECUTABLE_KINDS.has(v), {
    message: `not runnable yet — one of: ${[...EXECUTABLE_KINDS].join(', ')}`,
  }),
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
    .refine((v) => canonicalSymbol(v) in TOKENS, {
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
/**
 * Pause, resume or retire a strategy.
 *
 * There was no way to stop one. A user could add strategies until they hit the cap and then had
 * no route out — which also meant the cap, working correctly, read as the app being broken. The
 * commitment total only counts `live` and `watch`, so pausing frees the allowance immediately.
 */
routes.patch('/strategies/:id', async (c) => {
  const body = z
    .object({ state: z.enum(['draft', 'watch', 'live', 'paused', 'ended']) })
    .parse(await c.req.json());
  const w = await requireWallet(c);

  const row = await one<StrategyRow>(
    `UPDATE strategies SET state = $3 WHERE id = $1 AND wallet_id = $2 RETURNING *`,
    [c.req.param('id'), w.id, body.state],
  );
  if (!row) return c.json({ error: 'not_found' }, 404);

  await append({
    walletId: w.id,
    agent: 'xorr',
    action: `${body.state === 'paused' ? 'Paused' : body.state === 'live' ? 'Resumed' : 'Set'} ${row.label}`,
    detail:
      body.state === 'paused'
        ? 'It will not run again until you resume it. Nothing was sold.'
        : `Now ${body.state}.`,
    kind: 'risk',
    payload: { strategyId: row.id, state: body.state },
  });
  return c.json(toApi(row));
});

/**
 * Retire a strategy.
 *
 * Marks it `ended` rather than deleting the row: the runs and audit entries that reference it are
 * the user's own history, and a delete would take them with it.
 */
routes.delete('/strategies/:id', async (c) => {
  const w = await requireWallet(c);
  const row = await one<StrategyRow>(
    `UPDATE strategies SET state = 'ended', next_run_at = NULL
     WHERE id = $1 AND wallet_id = $2 RETURNING *`,
    [c.req.param('id'), w.id],
  );
  if (!row) return c.json({ error: 'not_found' }, 404);
  await append({
    walletId: w.id,
    agent: 'xorr',
    action: `Ended ${row.label}`,
    detail: 'It will not run again. Your history and any position it opened are untouched.',
    kind: 'risk',
    payload: { strategyId: row.id },
  });
  return c.json({ ok: true });
});

/**
 * A market order the user placed themselves — screen 14's "Buy ${amount} of {symbol}".
 *
 * ## Why this reuses `runStrategy` rather than adding a second spend path
 *
 * Everything that spends the user's money goes through one place: the period claim, the
 * policy engine, the on-chain cap read, the venue allowlist, the 1inch route and the
 * `spendAsDelegate` call. A "place this order now" endpoint that re-implemented any of that
 * would be a second door into the same room, and the second door is the one nobody
 * remembers to lock.
 *
 * So a manual order is a one-shot strategy: a `buy` row with no cadence, run immediately and
 * retired. It inherits every guard by construction, it shows up in the strategy list and the
 * audit trail like anything else, and there is exactly one code path that can move money.
 *
 * ## Why the app may call this at all
 *
 * `POST /orders` is not the bot acting on its own — it is the user exercising the authority
 * they already granted, and every limit on that authority is enforced server-side and
 * on-chain. A compromised phone can spend up to the cap at an allowlisted venue, which is
 * exactly the risk the cap describes and exactly what the kill switch ends in one tap. It
 * cannot withdraw, cannot name a destination, and cannot pick a price.
 */
/** The order's own label. `toLocaleString` so a four-figure order keeps its separator. */
function money(usd: number): string {
  return `$${usd.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

const OrderInput = z.object({
  symbol: z.string().min(1).max(12),
  usd: z.number().positive().max(1_000_000),
});

routes.post('/orders', async (c) => {
  const w = await requireWallet(c);
  const body = OrderInput.parse(await c.req.json());
  // Equities are `NVDAc`/`TSLAc`; uppercasing loses the suffix and the venue lookup misses.
  const symbol = canonicalSymbol(body.symbol);

  if (!VENUE_TOKENS[symbol]) {
    return c.json(
      {
        status: 'blocked',
        reason: 'not_tradable',
        detail: `${symbol} cannot be settled on ${CHAIN_KEY}, so there is no order to place.`,
      },
      409,
    );
  }

  // The same on-chain permission check `/strategies` does at creation. Read from the CHAIN:
  // absent permission has to mean refuse, not allow.
  const policy = await readPolicy(w.address as Address);
  if (!policy || policy.revoked) {
    return c.json(
      {
        status: 'blocked',
        reason: 'no_delegation',
        detail: 'No active trading permission on-chain. Grant one before placing an order.',
      },
      409,
    );
  }
  if (policy.expiresAt <= Date.now()) {
    return c.json(
      {
        status: 'blocked',
        reason: 'delegation_expired',
        detail: 'The trading permission has expired. Renew it before placing an order.',
      },
      409,
    );
  }

  // A one-shot `buy`: no cadence, so `advance()` never reschedules it.
  const row = await one<StrategyRow>(
    `INSERT INTO strategies (id, wallet_id, kind, state, label, symbol, params, cadence, next_run_at, daily_allocation_usd)
     VALUES ($1,$2,'buy','live',$3,$4,$5,NULL,NULL,$6) RETURNING *`,
    [
      randomUUID(),
      w.id,
      `${money(body.usd)} of ${symbol}`,
      symbol,
      JSON.stringify({ usd: body.usd, manual: true }),
      body.usd,
    ],
  );

  const outcome = await runStrategy(row!);

  // Retire it either way. A one-shot that stays `live` would sit on the strategy list
  // holding allowance against the cap for a trade that has already happened.
  await query(`UPDATE strategies SET state='ended' WHERE id=$1`, [row!.id]);

  return c.json(
    { ...outcome, orderId: row!.id },
    outcome.status === 'failed' ? 502 : outcome.status === 'blocked' ? 409 : 200,
  );
});

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

  /*
   * A strategy that can only CLOSE commits nothing, so the cap has nothing to say about it.
   *
   * The commitment check refused an `exit-rules` strategy whose own allocation was zero, because
   * the strategies already live summed past the cap — so a user whose day was committed could not
   * add a stop-loss, which is exactly the moment they would want one. Same mistake as the runtime
   * gate: a limit on putting capital at risk was being applied to the thing that takes it off.
   *
   * The sum still counts every spending strategy, and this one adds nothing to it.
   */
  const closeOnly = CLOSE_ONLY_KINDS.has(body.kind);
  const sums = await query<{ sum: string | null }>(
    `SELECT SUM(daily_allocation_usd) AS sum FROM strategies
      WHERE wallet_id=$1 AND state IN ('live','watch') AND kind <> ALL($2::text[])`,
    [w.id, [...CLOSE_ONLY_KINDS]],
  );
  const committed = Number(sums[0]?.sum ?? 0) + (closeOnly ? 0 : body.dailyAllocationUsd);
  if (!closeOnly && committed > policy.dailyCapUsd) {
    return c.json(
      {
        error: 'over_cap',
        message: `That would commit $${committed.toLocaleString('en-US')} a day against a $${policy.dailyCapUsd.toLocaleString('en-US')} cap. Raise the cap or lower this strategy.`,
      },
      400,
    );
  }

  /*
   * A spending strategy needs an amount; a self-sizing one decides its own.
   *
   * "Buy $0 of WETH every week" was accepted and would then be blocked at every single run — a
   * strategy that looks live on the list and can never do anything. A rebalance or a stop is
   * different: it is sized by looking, so zero is the correct configuration for it.
   */
  if (!SELF_SIZING_KINDS.has(body.kind) && !(body.dailyAllocationUsd > 0)) {
    return c.json(
      {
        error: 'invalid_request',
        detail: `dailyAllocationUsd: a ${body.kind} strategy needs an amount above zero.`,
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
/**
 * Pause, resume or retire a strategy.
 *
 * There was no way to stop one. A user could add strategies until they hit the cap and then had
 * no route out — which also meant the cap, working correctly, read as the app being broken. The
 * commitment total only counts `live` and `watch`, so pausing frees the allowance immediately.
 */
routes.patch('/strategies/:id', async (c) => {
  const body = z
    .object({ state: z.enum(['draft', 'watch', 'live', 'paused', 'ended']) })
    .parse(await c.req.json());
  const w = await requireWallet(c);

  const row = await one<StrategyRow>(
    `UPDATE strategies SET state = $3 WHERE id = $1 AND wallet_id = $2 RETURNING *`,
    [c.req.param('id'), w.id, body.state],
  );
  if (!row) return c.json({ error: 'not_found' }, 404);

  await append({
    walletId: w.id,
    agent: 'xorr',
    action: `${body.state === 'paused' ? 'Paused' : body.state === 'live' ? 'Resumed' : 'Set'} ${row.label}`,
    detail:
      body.state === 'paused'
        ? 'It will not run again until you resume it. Nothing was sold.'
        : `Now ${body.state}.`,
    kind: 'risk',
    payload: { strategyId: row.id, state: body.state },
  });
  return c.json(toApi(row));
});

/**
 * Retire a strategy.
 *
 * Marks it `ended` rather than deleting the row: the runs and audit entries that reference it are
 * the user's own history, and a delete would take them with it.
 */
routes.delete('/strategies/:id', async (c) => {
  const w = await requireWallet(c);
  const row = await one<StrategyRow>(
    `UPDATE strategies SET state = 'ended', next_run_at = NULL
     WHERE id = $1 AND wallet_id = $2 RETURNING *`,
    [c.req.param('id'), w.id],
  );
  if (!row) return c.json({ error: 'not_found' }, 404);
  await append({
    walletId: w.id,
    agent: 'xorr',
    action: `Ended ${row.label}`,
    detail: 'It will not run again. Your history and any position it opened are untouched.',
    kind: 'risk',
    payload: { strategyId: row.id },
  });
  return c.json({ ok: true });
});

// ── Activity / audit ─────────────────────────────────────────────────────────

routes.get('/positions', async (c) => {
  const w = await currentWallet(c);
  if (!w) return c.json([]);
  return c.json(await listPositions(w.id));
});

/**
 * One position, or null.
 *
 * `null` rather than 404, and the distinction matters. A position the user closed, or a deep link
 * to one that no longer exists, is a legitimate STATE — the screen has a correct empty view for
 * it. Answering 404 made the browser log "Failed to load resource" for a screen that was behaving
 * perfectly, which trains everyone to ignore console errors. `/proposals/current` already answers
 * the same shape of question the same way.
 *
 * A 404 is still the right answer when the caller is wrong about something. Here they are not.
 */
/**
 * What has actually been made, as opposed to what the open book is worth today.
 *
 * Separate from `/positions` because a closed position is not a holding and must not appear in a
 * holdings list — but the profit taken on it is real money and has to live somewhere.
 */
/**
 * Disposals, as a spreadsheet an accountant can open.
 *
 * The audit trail is the compliance artifact for what the BOT did; this is the compliance artifact
 * for what the user OWES, and they are not the same document. Average cost, stated in the file
 * rather than assumed, because a jurisdiction that wants FIFO needs to know this is not it.
 *
 * A disposal with no recorded cost is included and flagged. Excluding it would produce a tidier
 * file that understates proceeds, which is the wrong direction to be wrong in on a tax report.
 */
routes.get('/pnl/disposals.csv', async (c) => {
  const w = await requireWallet(c);
  const rows = await query<{
    at: Date;
    symbol: string;
    units: string;
    proceeds_usd: string;
    cost_usd: string;
    realised_usd: string;
    basis_known: boolean;
  }>(
    `SELECT at, symbol, units, proceeds_usd, cost_usd, realised_usd, basis_known
       FROM disposals WHERE wallet_id = $1 ORDER BY at ASC`,
    [w.id],
  );

  const header = 'date,symbol,units,proceeds_usd,cost_basis_usd,gain_loss_usd,basis_method,basis_known';
  const body = rows.map((r) =>
    [
      new Date(r.at).toISOString(),
      r.symbol,
      r.units,
      r.proceeds_usd,
      r.cost_usd,
      r.realised_usd,
      'average_cost',
      r.basis_known ? 'yes' : 'no',
    ].join(','),
  );
  const total = rows.reduce((a, r) => a + Number(r.realised_usd), 0);
  // A total row, because the first thing anyone does with this file is add up the last column.
  body.push(`,,,,,${total.toFixed(2)},,`);

  return c.body([header, ...body].join('\n'), 200, {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': 'attachment; filename="xorr-disposals.csv"',
  });
});

/**
 * Which interruptions this user wants, with every kind listed whether or not they have configured
 * it — a settings screen that only shows what has already happened is a settings screen you cannot
 * use until after the thing you wanted to turn off.
 */
routes.get('/notifications/prefs', async (c) => {
  const w = await requireWallet(c);
  const rows = await query<{ kind: string; enabled: boolean }>(
    `SELECT kind, enabled FROM notification_prefs WHERE wallet_id = $1`,
    [w.id],
  );
  const set = new Map(rows.map((r) => [r.kind, r.enabled]));
  return c.json(
    PUSH_KINDS.map((k) => ({ ...k, enabled: set.get(k.kind) ?? true })),
  );
});

routes.post('/notifications/prefs', async (c) => {
  const body = z
    .object({ kind: z.enum(PUSH_KINDS.map((k) => k.kind) as [string, ...string[]]), enabled: z.boolean() })
    .parse(await c.req.json());
  const w = await requireWallet(c);
  await query(
    `INSERT INTO notification_prefs (wallet_id, kind, enabled) VALUES ($1,$2,$3)
     ON CONFLICT (wallet_id, kind) DO UPDATE SET enabled = EXCLUDED.enabled`,
    [w.id, body.kind, body.enabled],
  );
  return c.json({ ok: true, kind: body.kind, enabled: body.enabled });
});

routes.get('/pnl/realised', async (c) => {
  const w = await requireWallet(c);
  return c.json(await realisedPnl(w.id));
});

routes.get('/positions/:id', async (c) => {
  const w = await requireWallet(c);
  return c.json((await getPosition(w.id, c.req.param('id'))) ?? null);
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
      /*
       * Where to go and check it.
       *
       * "The history you check is not a history we hold" is the README's claim, and the app was
       * not giving anyone a way to check. `explorerTx` deliberately returns a `fork:` or `local:`
       * label rather than a URL on those networks — a link to a block explorer that has never
       * seen the transaction is worse than no link, because it looks like the transaction is not
       * real.
       */
      explorer: r.signature ? explorerTx(r.signature) : undefined,
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
