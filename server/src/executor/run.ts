/**
 * The executor — PLAN.md 12.6 / 12.7 / 12.8.
 *
 * "A DCA retry that double-buys, or a double-approve that double-fills, is how a trading bot
 * loses real money quietly. Test it adversarially before any real capital touches it."
 *
 * The safety comes from the database, not from care:
 *   - strategy_runs.period_key is UNIQUE. Claiming a run is an INSERT. A second attempt in the
 *     same period violates the constraint and is refused. There is no window between "check" and
 *     "act" for a retry to slip through, because the check IS the write.
 *   - The spend is recorded in the SAME transaction that records the run.
 */
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { one, query, tx } from '../db/index.js';
import { append } from '../audit/log.js';
import { evaluate, recordSpend } from '../rules/engine.js';
import { readPolicy, spendAsDelegate } from '../evm/delegation.js';
import { explorerTx, ADDRESSES } from '../evm/chains.js';
import { buildSwap, TOKENS } from '../venues/oneinch.js';
import { decide } from '../graph/decide.js';
import type { Address } from 'viem';
import { periodKey, advance, type Cadence } from './schedule.js';
import { priceOf } from '../market/prices.js';

/**
 * Our XorrAquaBook deployment, when there is one. Aqua only exists on Base mainnet, so on Sepolia
 * this is unset and every route falls to the aggregator — which the decision says out loud rather
 * than pretending it considered a book.
 */
const AQUA_BOOK_ADDRESS = process.env.AQUA_BOOK_ADDRESS;

/**
 * Roughly how many base units of `symbol` a dollar amount buys, for the venue depth check.
 *
 * Approximate on purpose: it decides which venue to ASK, and the venue then quotes for real. A
 * price lookup that failed should not block the trade, so it falls back to no depth constraint.
 */
async function estimateOutUnits(
  usd: number,
  symbol: string,
  decimals: number,
): Promise<bigint | undefined> {
  try {
    const px = await priceOf(symbol);
    if (!(px > 0)) return undefined;
    return BigInt(Math.floor((usd / px) * 10 ** decimals));
  } catch {
    return undefined;
  }
}
import { applyFill } from '../positions/index.js';
import { DELEGATION_ADDRESS } from '../evm/delegation.js';

/** The address that holds the tokens when the router is called: the delegation contract. */
const DELEGATION_FROM = DELEGATION_ADDRESS;

export type RunOutcome =
  | { status: 'filled'; runId: string; signature: string; units: number; price: number }
  /** Watch mode: what the strategy WOULD have done. No capital moved. PLAN.md 9.12. */
  | { status: 'watch'; runId: string; units: number; price: number }
  | { status: 'blocked'; runId: string; reason: string; detail: string }
  | { status: 'failed'; runId: string; error: string }
  | { status: 'skipped'; reason: 'already_ran_this_period' };

export type StrategyRow = {
  id: string;
  wallet_id: string;
  /** The user's own wallet address — the `owner` in the delegation policy. */
  owner_address?: string;
  kind: string;
  state: string;
  label: string;
  symbol: string;
  params: { usd?: number };
  cadence: Cadence | null;
  next_run_at: Date | null;
  daily_allocation_usd: string;
};

/**
 * Claim the period. Returns null when this period has already been claimed — which is exactly
 * what makes a retry, a restart, or two schedulers racing all safe.
 */
async function claimRun(
  client: PoolClient,
  strategyId: string,
  key: string,
): Promise<string | null> {
  const res = await client.query<{ id: string }>(
    `INSERT INTO strategy_runs (id, strategy_id, period_key, status)
     VALUES ($1,$2,$3,'pending')
     ON CONFLICT (period_key) DO NOTHING
     RETURNING id`,
    [randomUUID(), strategyId, key],
  );
  return res.rows[0]?.id ?? null;
}

/**
 * Strategy kinds the executor can actually run.
 *
 * Adding a tier to `src/strategies/ladder.ts` is not enough — it needs a branch here, and this set
 * is what stops a half-built tier from silently behaving like a recurring buy.
 */
export const EXECUTABLE_KINDS = new Set(['dca', 'buy', 'recurring-buy']);

export async function runStrategy(
  strategy: StrategyRow,
  at: Date = new Date(),
): Promise<RunOutcome> {
  const cadence = (strategy.cadence ?? 'daily') as Cadence;
  const key = periodKey(strategy.id, cadence, at);

  // ── 1. Claim the period, atomically. ──
  const runId = await tx(async (client) => claimRun(client, strategy.id, key));
  if (!runId) return { status: 'skipped', reason: 'already_ran_this_period' };

  const usd = Number(strategy.params.usd ?? strategy.daily_allocation_usd ?? 0);
  const walletId = strategy.wallet_id;

  // ── Watch mode — PLAN.md 9.12 / §3.3, the trust ramp. ──
  // The strategy runs against LIVE prices and posts the trade it WOULD have made, without
  // touching the delegation. Every number it produces is labelled simulated, so a watch run can
  // never be mistaken for a fill.
  if (strategy.state === 'watch') {
    try {
      const price = await priceOf(strategy.symbol);
      const units = usd / price;
      await tx(async (client) => {
        await client.query(
          `UPDATE strategy_runs SET status='skipped', usd=$2, units=$3, price=$4, error='watch_mode', finished_at=now()
           WHERE id=$1`,
          [runId, usd, units, price],
        );
        if (strategy.cadence) {
          await client.query(`UPDATE strategies SET next_run_at=$2 WHERE id=$1`, [
            strategy.id,
            advance(at, cadence),
          ]);
        }
        await append(
          {
            walletId,
            agent: 'Yield Keeper',
            action: `Would have bought ${units.toFixed(4)} ${strategy.symbol}`,
            detail: `Simulated · ${strategy.label} · $${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. No capital moved.`,
            kind: 'risk',
            payload: { runId, strategyId: strategy.id, simulated: true },
          },
          client,
        );
      });
      return { status: 'watch', runId, units, price };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await tx(async (client) => {
        await client.query(
          `UPDATE strategy_runs SET status='failed', error=$2, finished_at=now() WHERE id=$1`,
          [runId, error],
        );
      });
      return { status: 'failed', runId, error };
    }
  }

  // ── 2. Limits, enforced here and not in the client. ──
  /*
   * The permission, as the CHAIN records it.
   *
   * This used to read the `delegations` table. A row is written when the app records a grant, so a
   * user who granted from another device — or before that write existed — had no row and every run
   * was blocked for a permission that was live on chain. Failing closed is the right direction to
   * be wrong in, but it is still wrong: the chain is the authority everywhere else in this file.
   */
  const ownerAddress = (
    await one<{ address: string }>(`SELECT address FROM wallets WHERE id = $1`, [walletId])
  )?.address as Address | undefined;
  if (!ownerAddress) {
    return finishBlocked(runId, walletId, strategy, 'no_wallet', 'This wallet has no address on file.');
  }

  const chainPolicy = await readPolicy(ownerAddress);
  if (!chainPolicy) {
    return finishBlocked(runId, walletId, strategy, 'no_delegation', 'No trading permission has been granted.');
  }

  const verdict = await evaluate({
    walletId,
    usd,
    dailyCapUsd: chainPolicy.dailyCapUsd,
    delegationExpiresAt: new Date(chainPolicy.expiresAt),
    delegationRevoked: chainPolicy.revoked,
  });

  if (!verdict.allowed) {
    return finishBlocked(runId, walletId, strategy, verdict.reason, verdict.detail);
  }

  /*
   * What KIND of strategy is this?
   *
   * Every strategy used to execute as a USDC->symbol buy regardless of what it said it was, so a
   * rebalance or a stop-loss would have quietly bought instead. A kind with no branch must stop
   * here, loudly, rather than do something plausible and wrong with the user's money.
   */
  if (!EXECUTABLE_KINDS.has(strategy.kind)) {
    return finishBlocked(
      runId,
      walletId,
      strategy,
      'kind_not_executable',
      `Nothing here knows how to run a "${strategy.kind}" strategy yet, so it was not run.`,
    );
  }

  // ── 3. Execute on chain. ──
  try {
    const owner = ownerAddress;

    /**
     * Ask The Graph first. This is the agent reasoning over indexed chain data, and it can stop
     * the run for reasons our own database cannot see — a permission revoked from another device,
     * a cap already consumed by a trade we did not make, or realised flow that says the book is
     * being picked off.
     */
    const outToken = TOKENS[strategy.symbol === 'ETH' ? 'WETH' : strategy.symbol];
    const graphCall = await decide({
      owner,
      wantUsd: usd,
      token: ADDRESSES.usdcBase,
      // The second index needs to know which app's books to look in and how much of the bought
      // token has to come out of one for it to be a candidate.
      aquaApp: AQUA_BOOK_ADDRESS,
      tokenOut: outToken?.address,
      amountOut: outToken ? await estimateOutUnits(usd, strategy.symbol, outToken.decimals) : undefined,
    }).catch(() => null);
    // "The index is about another contract" is not a reason to refuse the trade — it is the index
    // declining to have an opinion. Treating it as a block would stop every run on a fork, where
    // there is no subgraph at all. The contract check below is the authority either way.
    if (graphCall && !graphCall.act && graphCall.reason !== 'index_is_for_another_deployment') {
      return finishBlocked(runId, walletId, strategy, graphCall.reason, graphCall.rationale);
    }

    // Then the contract itself, as the final authority.
    const policy = await readPolicy(owner);
    if (!policy) {
      return finishBlocked(runId, walletId, strategy, 'no_delegation', 'No trading permission is granted on-chain.');
    }
    if (policy.revoked) {
      return finishBlocked(
        runId,
        walletId,
        strategy,
        'delegation_revoked_onchain',
        'The permission was revoked on-chain, so I did not place this.',
      );
    }
    if (usd > policy.remainingTodayUsd) {
      return finishBlocked(
        runId,
        walletId,
        strategy,
        'onchain_daily_cap',
        `The contract allows ${policy.remainingTodayUsd.toFixed(2)} more today, and this asks for ${usd.toFixed(2)}.`,
      );
    }

    const price = await priceOf(strategy.symbol);
    const units = usd / price;

    // Real 1inch calldata. The delegation contract pulls the USDC and forwards this to the router
    // inside one transaction, so the user's funds are never parked anywhere in between — and the
    // bought token is delivered straight to the user's own wallet, never to the contract.
    const swap = await buildSwap({
      inSymbol: 'USDC',
      outSymbol: strategy.symbol === 'ETH' ? 'WETH' : strategy.symbol,
      amount: usd,
      from: DELEGATION_FROM,
      receiver: owner,
    });

    const signature = await spendAsDelegate({
      owner,
      token: ADDRESSES.usdcBase,
      venue: swap.to,
      usd,
      data: swap.data,
    });

    /*
     * Record what just happened.
     *
     * This was missing entirely: the trade settled on chain and the app learned nothing from it —
     * no position, no audit entry, no next run scheduled, and the run row left claimed but never
     * finished. `applyFill` was imported and never called. The chain was right and every screen
     * was wrong, which is the worst way for those two to disagree.
     *
     * One transaction, because a position without an audit entry is an unexplained holding and an
     * audit entry without a position is a trade the portfolio does not know about.
     */
    await tx(async (client) => {
      await client.query(
        `UPDATE strategy_runs SET status='filled', signature=$2, units=$3, price=$4, finished_at=now()
         WHERE id=$1`,
        [runId, signature, units, price],
      );
      await applyFill(client, { walletId, symbol: strategy.symbol, units, usd });
      await recordSpend(walletId, usd, client);
      await append(
        {
          walletId,
          agent: 'Yield Keeper',
          action: `Bought ${units.toFixed(4)} ${strategy.symbol}`,
          detail: `$${usd.toLocaleString('en-US')} at $${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}. ${strategy.label}.`,
          kind: 'trade',
          signature,
          payload: {
            runId,
            strategyId: strategy.id,
            units,
            price,
            usd,
            explorer: explorerTx(signature),
          },
        },
        client,
      );
      // Schedule the next one. Without this a strategy fills once and then sits there looking
      // live, which is indistinguishable from being broken.
      if (strategy.cadence) {
        await client.query(`UPDATE strategies SET next_run_at=$2 WHERE id=$1`, [
          strategy.id,
          advance(at, strategy.cadence),
        ]);
      }
    });

    return { status: 'filled', runId, signature, units, price };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await tx(async (client) => {
      await client.query(
        `UPDATE strategy_runs SET status='failed', error=$2, finished_at=now() WHERE id=$1`,
        [runId, error],
      );
      await append(
        {
          walletId,
          agent: 'Yield Keeper',
          action: `Could not run ${strategy.label}`,
          detail: humanFailure(error),
          kind: 'block',
          payload: { runId, strategyId: strategy.id, raw: error },
        },
        client,
      );
    });
    return { status: 'failed', runId, error };
  }
}

async function finishBlocked(
  runId: string,
  walletId: string,
  strategy: StrategyRow,
  reason: string,
  detail: string,
): Promise<RunOutcome> {
  await tx(async (client) => {
    await client.query(
      `UPDATE strategy_runs SET status='blocked', error=$2, finished_at=now() WHERE id=$1`,
      [runId, reason],
    );
    // A non-action is logged exactly like an action. That is the point of the trail.
    await append(
      {
        walletId,
        agent: 'Drawdown Guard',
        action: `Skipped ${strategy.symbol}`,
        detail,
        kind: 'block',
        payload: { runId, strategyId: strategy.id, reason },
      },
      client,
    );
  });
  return { status: 'blocked', runId, reason, detail };
}

/**
 * On-chain failures the handoff never designed for — PLAN.md 10.13 [G46]. Each one gets plain
 * language, because "custom program error: 0x1" is not something to show a person.
 */
export function humanFailure(error: string): string {
  const e = error.toLowerCase();

  /**
   * XorrDelegation's custom errors, by 4-byte selector.
   *
   * Match the selector EXACTLY. Substring matching is a trap here — one selector is a prefix of
   * another often enough that a naive `includes` reports the wrong cause, which on a trading
   * surface is worse than saying nothing. (These replaced a table of Solana Anchor codes that
   * could never fire on an EVM chain, so every real revert fell through to the generic line.)
   */
  const BY_SELECTOR: Record<string, string> = {
    '0x1db3b859': 'That agent is not the one you gave permission to.', // NotDelegate()
    '0x430f7460': 'You revoked the trading permission, so nothing was placed.', // PolicyRevoked()
    '0x9c5bebca': 'The trading permission has expired. Renew it to let the bot trade again.', // PolicyExpired()
    '0x2114fba2': 'That venue is not on your allowlist, so the trade was refused.', // VenueNotAllowed
    '0x3e814127': "Today's cap is used up. Nothing was placed.", // DailyCapExceeded
    '0x1f2a2005': 'The order size came out as zero, so nothing was placed.', // ZeroAmount()
    '0xc2e441e5': 'The venue rejected the order, so nothing was placed.', // VenueCallFailed()
  };
  const selector = /(?:custom error|reverted with|signature)[^0-9a-fx]*(0x[0-9a-f]{8})\b/.exec(e)?.[1];
  if (selector && BY_SELECTOR[selector]) return BY_SELECTOR[selector];

  // Named errors, when the RPC decodes them for us.
  if (e.includes('dailycapexceeded')) return BY_SELECTOR['0x3e814127']!;
  if (e.includes('policyrevoked')) return BY_SELECTOR['0x430f7460']!;
  if (e.includes('policyexpired')) return BY_SELECTOR['0x9c5bebca']!;
  if (e.includes('venuenotallowed')) return BY_SELECTOR['0x2114fba2']!;
  if (e.includes('notdelegate')) return BY_SELECTOR['0x1db3b859']!;

  if (e.includes('cannot fill on'))
    return 'This network cannot settle trades. Prices are real; filling needs Base or a Base fork.';
  if (e.includes('transfer amount exceeds allowance') || e.includes('pull failed'))
    return 'The spending approval is too small or was withdrawn, so nothing could be pulled.';
  // The bot paying for gas and the user paying for the trade are different pockets, and saying
  // "you are short" when the bot is short sends someone looking in the wrong place.
  if (e.includes('exceeds the balance of the account') || e.includes('gas required exceeds'))
    return 'The agent ran out of gas money on this network, so nothing was placed. Your funds are untouched.';
  if (e.includes('insufficient funds') || e.includes('exceeds balance'))
    return 'Not enough settled balance to cover this buy.';
  if (e.includes('slippage') || e.includes('returnamount') || e.includes('min return'))
    return 'The price moved more than your slippage limit while this was in flight.';
  if (e.includes('nonce') || e.includes('replacement transaction'))
    return 'The network moved on before this confirmed. Nothing was placed; I will retry.';
  if (e.includes('timed out') || e.includes('timeout'))
    return 'The network did not confirm in time. I will check and retry rather than send twice.';
  if (e.includes('gas') || e.includes('fee too low') || e.includes('underpriced'))
    return 'The network was congested and the fee was too low to land.';
  return 'The transaction did not go through, so nothing was placed.';
}
