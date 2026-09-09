/**
 * The executor API — PLAN.md 12.1. Mirrors the client's repository interfaces one-to-one, so
 * swapping the app from fixtures to the server changes src/data/index.ts and nothing else.
 */
import { randomUUID } from 'node:crypto';
import { log } from '../http/request-id.js';
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
import { dripGasIfNeeded } from '../evm/gasDrip.js';
import {
  allowedVenues,
  delegatePublicKey,
  readPolicy,
  waitForTx,
  DELEGATION_ADDRESS,
} from '../evm/delegation.js';
import { requireUser } from '../auth/middleware.js';
import { currentWallet, requireWallet, type WalletRow } from './wallet-context.js';
import { erc20Abi, formatUnits } from 'viem';
import type { Address, Hex } from 'viem';
import { priceOf } from '../market/prices.js';
import { totalValueUsd } from '../evm/balances.js';
import { TOKENS } from '../venues/oneinch.js';
import { publicClient } from '../evm/client.js';
import { STOCKS, isStock } from '../venues/stocks.js';
import { getPosition, listPositions, realisedPnl } from '../positions/index.js';
import { PUSH_KINDS } from '../notifications/push.js';

/**
 * Every wallet lookup is scoped to the AUTHENTICATED Privy user.
 *
 * The previous build read "the first wallet row", which was fine for one user on a laptop and
 * catastrophic for two: any caller could act on anyone's capital. Privy gives a verified user id
 * on every request and it is the key for everything below.
 */

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
    `INSERT INTO wallets (id, user_id, address, kind, cluster, active_at)
     VALUES ($1,$2,$3,'embedded',$4, now())
     ON CONFLICT (address) DO UPDATE
       SET user_id = EXCLUDED.user_id, active_at = now() RETURNING *`,
    [randomUUID(), userId, address, CHAIN_KEY],
  );
  await append({
    walletId: row!.id,
    agent: 'xorr',
    action: 'Wallet connected',
    detail: `Your keys, held by you. ${CHAIN_KEY}.`,
    kind: 'risk',
  });

  /*
   * A wallet that cannot pay gas cannot sign the permission, and the permission is the product.
   *
   * Privy creates the embedded wallet empty, so on the hosted deployment a first-time visitor
   * reached the delegate screen and the signature failed on `insufficient funds` — every screen
   * past that point unreachable. The drip refuses on mainnet and on a fork of it, refuses a wallet
   * that already holds anything, and refuses to spend the delegate below its own gas reserve.
   *
   * Awaited but never allowed to throw: the wallet exists and is usable either way, and someone
   * funding it themselves must not be blocked by a faucet that had nothing to give. The outcome is
   * written to the trail because a transfer out of the delegate's key is exactly the sort of thing
   * that should never happen unrecorded.
   */
  const drip = await dripGasIfNeeded(address as Address).catch((e) => ({
    sent: false as const,
    reason: e instanceof Error ? e.message : String(e),
  }));
  await append({
    walletId: row!.id,
    agent: 'xorr',
    action: drip.sent ? `Sent ${drip.amountEth} test ETH for gas` : 'No gas sent',
    detail: drip.sent
      ? `${CHAIN_KEY} test ETH, so you can sign the permission. It has no value and buys nothing.`
      : `Not sent — ${drip.reason}.`,
    kind: 'risk',
    payload: drip.sent ? { hash: drip.hash } : { reason: drip.reason },
  }).catch(() => undefined);

  return c.json(row);
});

/**
 * The endpoint onboarding actually calls.
 *
 * `/wallet/create` exists and is the one that reads like the entry point, but screen 2 posts here —
 * Privy has already made the wallet, so the app is telling the executor about an address rather
 * than asking for one. That distinction cost the gas drip a whole deploy: it was added to
 * `/wallet/create`, which the app never calls, and a wallet signed in through the hosted build
 * still arrived with nothing to pay gas with.
 */
routes.post('/wallet/connect', async (c) => {
  const { userId } = requireUser(c);
  const body = z.object({ address: z.string().regex(/^0x[a-fA-F0-9]{40}$/) }).parse(await c.req.json());

  /*
   * Was this wallet already known? Asked BEFORE the upsert, because afterwards there is no way to
   * tell an insert from an update — and the drip must fire once, on first sight, not on every app
   * load for as long as the wallet stays empty.
   */
  const known = await one<{ id: string }>(`SELECT id FROM wallets WHERE address = $1`, [body.address]);

  const row = await one<WalletRow>(
    // `active_at` is the point of this call as much as the row is: the app is telling us which of
    // this user's addresses it is on, and that is what `currentWallet` orders by.
    `INSERT INTO wallets (id, user_id, address, kind, cluster, active_at)
     VALUES ($1,$2,$3,'connected',$4, now())
     ON CONFLICT (address) DO UPDATE
       SET kind='connected', user_id = EXCLUDED.user_id, active_at = now() RETURNING *`,
    [randomUUID(), userId, body.address, CHAIN_KEY],
  );

  if (!known) {
    await append({
      walletId: row!.id,
      agent: 'xorr',
      action: 'Wallet connected',
      detail: `Your keys, held by you. ${CHAIN_KEY}.`,
      kind: 'risk',
    }).catch(() => undefined);

    /*
     * A wallet that cannot pay gas cannot sign the permission, and the permission is the product.
     *
     * Privy creates the embedded wallet empty, so on the hosted deployment a first-time visitor
     * reached the delegate screen and the signature failed on `insufficient funds` — every screen
     * past that point unreachable. `dripGasIfNeeded` refuses on mainnet and on a fork of it,
     * refuses a wallet that already holds anything, and refuses to spend the delegate below its
     * own reserve.
     *
     * Never fatal: the wallet is created and usable either way, and someone funding it themselves
     * must not be blocked by a faucet that had nothing to give. Recorded in the trail because a
     * transfer out of the delegate's key should never happen unlogged.
     */
    const drip = await dripGasIfNeeded(body.address as Address).catch((e: unknown) => ({
      sent: false as const,
      reason: e instanceof Error ? e.message : String(e),
    }));
    await append({
      walletId: row!.id,
      agent: 'xorr',
      action: drip.sent ? `Sent ${drip.amountEth} test ETH for gas` : 'No gas sent',
      detail: drip.sent
        ? `${CHAIN_KEY} test ETH, so you can sign the permission. It has no value and buys nothing.`
        : `Not sent — ${drip.reason}.`,
      kind: 'risk',
      payload: drip.sent ? { hash: drip.hash } : { reason: drip.reason },
    }).catch(() => undefined);
  }

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
      log.error('[balance] chain read failed:', e instanceof Error ? e.message : e);
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
/**
 * Decimals for a settlement token.
 *
 * `TOKENS` is the routing registry and holds mainnet addresses, which is the wrong ADDRESS for a
 * Sepolia build — but decimals are a property of the asset rather than of the deployment, and USDC
 * is 6 everywhere it exists. Eighteen is the ERC-20 default and the right guess for anything not
 * listed, but a wrong guess here misplaces a decimal point on a permission screen, so an unknown
 * symbol is reported raw instead.
 */
function decimalsFor(symbol: string): number {
  return TOKENS[canonicalSymbol(symbol)]?.decimals ?? 18;
}

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
      /*
       * And in the token's own units, because "48000000000" is not a quantity anyone reads.
       *
       * The raw value stays alongside it: it is what the chain holds and what a reader would
       * check against an explorer, and rounding it away would make this screen unverifiable in
       * exactly the way the rest of the product refuses to be.
       */
      display: formatUnits(allowances[i] ?? 0n, decimalsFor(t.symbol)),
      decimals: decimalsFor(t.symbol),
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
/**
 * A 32-byte transaction hash, and nothing else.
 *
 * Both record routes took `z.string()`, so any text at all was accepted, written into the
 * append-only audit trail, and rendered there as a TRANSACTION with a block-explorer link. Passing
 * `"0xabc"` produced a permanent entry — "Trading permission granted · TRANSACTION 0xabc" — whose
 * link 404s for anyone who follows it. `waitForTx` swallows the failure for a malformed hash, so
 * nothing downstream noticed.
 *
 * The policy itself is still read from the chain and always was; this is about not writing an
 * unverifiable claim into a record that cannot be corrected afterwards.
 */
const TxHash = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, 'must be a 32-byte transaction hash, 0x followed by 64 hex digits');

routes.post('/delegation/record', async (c) => {
  const body = z
    .object({ txHash: TxHash, dailyCapUsd: z.number().positive(), expiresAt: z.number() })
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
  const body = z.object({ txHash: TxHash.optional() }).parse(await c.req.json().catch(() => ({})));
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

/**
 * Every disposal, one row per sale.
 *
 * `/pnl/realised` aggregates by symbol, which is the right shape for "what have I made" and the
 * wrong one for "which sale was that". `/pnl/disposals.csv` has the rows but only as a file, so the
 * app could hand them to an accountant and never show them to the person who made them.
 *
 * `basis_known` is carried through per row rather than folded into the total. A sale whose cost was
 * never recorded understates the gain, and which sale it was is the thing an accountant asks first.
 */
routes.get('/disposals', async (c) => {
  const w = await requireWallet(c);
  const rows = await query<{
    id: string;
    symbol: string;
    at: Date;
    units: string;
    proceeds_usd: string;
    cost_usd: string;
    realised_usd: string;
    basis_known: boolean;
  }>(
    `SELECT id, symbol, at, units, proceeds_usd, cost_usd, realised_usd, basis_known
       FROM disposals WHERE wallet_id = $1 ORDER BY at DESC LIMIT 200`,
    [w.id],
  );
  return c.json(
    rows.map((r) => ({
      id: r.id,
      symbol: r.symbol,
      at: r.at.toISOString(),
      // NUMERIC arrives as a string because it is arbitrary precision; these are display
      // quantities of known small magnitude, so parsing them here is safe and honest.
      units: Number(r.units),
      proceeds: Number(r.proceeds_usd),
      cost: Number(r.cost_usd),
      realised: Number(r.realised_usd),
      basisKnown: r.basis_known,
    })),
  );
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

/**
 * The cap, read from the chain — like every other surface that reports it.
 *
 * This route asked Postgres: `SELECT daily_cap_usd ... FROM delegations`. Everything else in the
 * product asks the contract, and /verify publishes the claim in as many words — "The permission is
 * read from the chain, never from our database." This was the one place that was not true, and
 * `readPolicy`'s own docblock says why it matters: *never trust our own database for an enforcement
 * decision.*
 *
 * It showed. On the fork wallet, where the local row is stale, /limits rendered "Nothing —
 * permission is off · $0.00 cap · $480.00 spent" while /delegation and /safety, one tap away, both
 * read the chain and said Live with a $2,810 cap. Three screens, one wallet, two answers to the
 * question this whole product exists to answer — and the wrong one came from the database copy.
 *
 * Both numbers are still reported, because the footer on that screen promises exactly that: the cap
 * is enforced on the chain AND again by the executor, "and the stricter of the two is the one that
 * binds". So the chain gives the cap and the revocation, the executor's own tally gives what it
 * believes it has spent, and `remainingUsd` is the smaller of the two remainders — which is the
 * number that actually governs the next trade.
 */
routes.get('/limits', async (c) => {
  const w = await requireWallet(c);
  const policy = await readPolicy(w.address as Address).catch(() => null);
  const ourSpend = await spentToday(w.id);

  if (!policy || policy.revoked) {
    return c.json({
      dailyCapUsd: 0,
      spentTodayUsd: ourSpend,
      remainingUsd: 0,
      revoked: true,
    });
  }

  return c.json({
    dailyCapUsd: policy.dailyCapUsd,
    // The chain's own tally, so "spent" and "cap" come from one source and cannot disagree.
    spentTodayUsd: policy.spentTodayUsd,
    remainingUsd: Math.max(0, Math.min(policy.remainingTodayUsd, policy.dailyCapUsd - ourSpend)),
    revoked: false,
    /*
     * The expiry, so a zero here can say WHY it is zero.
     *
     * An expired policy is not revoked, so this route answered `{dailyCapUsd: 1600, spentTodayUsd:
     * 0, remainingUsd: 0, revoked: false}` — a $1,600 limit with nothing spent and nothing left,
     * which is not a state the screen could explain because the number that explains it was not
     * sent. Observed on the hosted deployment against a grant that had lapsed thirteen hours
     * earlier, while `/safety` showed the same permission as Live.
     */
    expiresAt: policy.expiresAt,
  });
});

/**
 * Can this trade go through? Answered from the CHAIN, for the same reason `/limits` above is.
 *
 * The docblock twenty lines up describes this exact bug being fixed — and it was fixed on the GET
 * and missed here, on the POST. Which is the worse half: `/limits` only *reports* the cap, while
 * this route is the pre-trade authorisation check. It asked Postgres, and Postgres holds a CACHE
 * of the permission that is only as fresh as the last time a grant was recorded through us.
 *
 * Caught by granting a fresh permission in the browser and then asking this route about it: the
 * chain said live with $1,600 of headroom, `/limits` agreed, and this route answered
 * `{"allowed":false,"reason":"delegation_expired"}` — refusing every trade the user had just
 * signed for. A stale cache cannot be allowed to veto a live permission any more than it can be
 * allowed to authorise a revoked one.
 *
 * `evaluate` still applies the executor's own daily tally on top, because the footer on the limits
 * screen promises both are enforced and the stricter one binds.
 */
routes.post('/limits/check', async (c) => {
  const body = z.object({ usd: z.number() }).parse(await c.req.json());
  const w = await requireWallet(c);
  const policy = await readPolicy(w.address as Address).catch(() => null);
  if (!policy) {
    return c.json({
      allowed: false,
      reason: 'no_delegation',
      detail: 'No active trading permission on-chain. Grant one before placing an order.',
    });
  }
  return c.json(
    await evaluate({
      walletId: w.id,
      usd: body.usd,
      dailyCapUsd: policy.dailyCapUsd,
      delegationExpiresAt: new Date(policy.expiresAt),
      delegationRevoked: policy.revoked,
    }),
  );
});

// ── Prices ───────────────────────────────────────────────────────────────────

routes.get('/price/:symbol', async (c) => {
  /*
   * Not `.toUpperCase()`, and not `source: 'coingecko'` either.
   *
   * Uppercasing turned `NVDAc` into `NVDAC`, which is not a token anyone lists, so every equity
   * price answered "No price feed for NVDAC" for an asset on the app's own markets screen. And the
   * source was hardcoded: equities are priced from a live 1inch route, so naming CoinGecko was
   * simply false for eight of the symbols this route serves.
   */
  const symbol = canonicalSymbol(c.req.param('symbol'));
  try {
    const price = await priceOf(symbol);
    return c.json({ symbol, price, source: isStock(symbol) ? '1inch' : 'coingecko' });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});
