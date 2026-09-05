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
import { PublicKey } from '@solana/web3.js';
import type { PoolClient } from 'pg';
import { one, query, tx } from '../db/index.js';
import { append } from '../audit/log.js';
import { evaluate, recordSpend } from '../rules/engine.js';
import { readPolicy, spendAsDelegate } from '../evm/delegation.js';
import { explorerTx, ADDRESSES } from '../evm/chains.js';
import { buildSwap } from '../venues/oneinch.js';
import type { Address } from 'viem';
import { periodKey, advance, type Cadence } from './schedule.js';
import { priceOf } from '../market/prices.js';
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
  const delegation = (
    await query<{
      daily_cap_usd: string;
      expires_at: Date;
      revoked: boolean;
    }>(
      `SELECT daily_cap_usd, expires_at, revoked FROM delegations
       WHERE wallet_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [walletId],
    )
  )[0];

  if (!delegation) {
    return finishBlocked(runId, walletId, strategy, 'no_delegation', 'No trading permission has been granted.');
  }

  const verdict = await evaluate({
    walletId,
    usd,
    dailyCapUsd: Number(delegation.daily_cap_usd),
    delegationExpiresAt: new Date(delegation.expires_at),
    delegationRevoked: delegation.revoked,
  });

  if (!verdict.allowed) {
    return finishBlocked(runId, walletId, strategy, verdict.reason, verdict.detail);
  }

  // ── 3. Execute on chain. ──
  try {
    const owner = (await one<{ address: string }>(
      `SELECT address FROM wallets WHERE id = $1`,
      [walletId],
    ))?.address as Address | undefined;
    if (!owner) throw new Error('This wallet has no address on file.');

    // The CHAIN is the source of truth for what the bot may spend — never our own database.
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
    // inside one transaction, so the user's funds are never parked anywhere in between.
    const swap = await buildSwap({
      inSymbol: 'USDC',
      outSymbol: strategy.symbol === 'ETH' ? 'WETH' : strategy.symbol,
      amount: usd,
      from: DELEGATION_FROM,
    });

    const signature = await spendAsDelegate({
      owner,
      token: ADDRESSES.usdcBase,
      venue: swap.to,
      usd,
      data: swap.data,
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
   * Match the program error code EXACTLY. Substring matching is a trap here: "0x1771" (slippage)
   * contains "0x1" (insufficient funds), so a naive `includes` reports the wrong cause to the
   * user — which on a trading surface is worse than saying nothing.
   */
  const code = /custom program error:\s*(0x[0-9a-f]+)/.exec(e)?.[1];
  const BY_CODE: Record<string, string> = {
    '0x1': 'Not enough settled balance to cover this buy.',
    '0x4': 'The trading permission no longer covers this account.',
    '0x1771': 'The price moved more than your slippage limit while this was in flight.',
  };
  if (code) return BY_CODE[code] ?? 'The venue rejected the order, so nothing was placed.';

  if (e.includes('insufficient funds')) return 'Not enough settled balance to cover this buy.';
  if (e.includes('blockhash not found') || e.includes('expired'))
    return 'The network moved on before this confirmed. Nothing was placed; I will retry.';
  if (e.includes('slippage'))
    return 'The price moved more than your slippage limit while this was in flight.';
  if (e.includes('owner does not match'))
    return 'The trading permission no longer covers this account.';
  if (e.includes('timed out') || e.includes('timeout'))
    return 'The network did not confirm in time. I will check and retry rather than send twice.';
  if (e.includes('priority') || e.includes('fee'))
    return 'The network was congested and the fee was too low to land.';
  return 'The transaction did not go through, so nothing was placed.';
}
