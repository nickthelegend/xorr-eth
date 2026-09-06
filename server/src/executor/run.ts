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
import { closeAsDelegate, readPolicy, spendAsDelegate, waitForTx } from '../evm/delegation.js';
import { erc20Abi, formatUnits } from 'viem';
import { publicClient } from '../evm/client.js';
import { gasStatus } from '../routes/ops.js';
import { explorerTx, ADDRESSES } from '../evm/chains.js';
import { buildSwap, SLIPPAGE, TOKENS } from '../venues/oneinch.js';
import { decide } from '../graph/decide.js';
import type { Address } from 'viem';
import { periodKey, advance, type Cadence } from './schedule.js';
import { priceOf } from '../market/prices.js';
import { send } from '../notifications/push.js';
import { PLANNERS, observationFor, type TradeIntent } from './kinds/index.js';
import { TOKENS as VENUE_TOKENS } from '../venues/oneinch.js';

/**
 * Our XorrAquaBook deployment, when there is one. Aqua only exists on Base mainnet, so on Sepolia
 * this is unset and every route falls to the aggregator — which the decision says out loud rather
 * than pretending it considered a book.
 */
const AQUA_BOOK_ADDRESS = process.env.AQUA_BOOK_ADDRESS;

/** The owner's balance of a token, exactly as the chain holds it. Undefined if it cannot be read. */
async function rawBalanceOf(owner: Address, symbol: string): Promise<bigint | undefined> {
  const token = VENUE_TOKENS[symbol];
  if (!token) return undefined;
  return publicClient
    .readContract({ address: token.address, abi: erc20Abi, functionName: 'balanceOf', args: [owner] })
    .catch(() => undefined);
}

/**
 * How many units of `symbol` moved, in the token's own decimals.
 *
 * Undefined when either read failed — in which case the caller keeps its estimate rather than
 * recording a zero, since a zero here would erase the position.
 */
async function measuredDelta(params: {
  owner: Address;
  symbol: string;
  before: bigint | undefined;
}): Promise<number | undefined> {
  if (params.before === undefined) return undefined;
  const token = VENUE_TOKENS[params.symbol];
  const after = await rawBalanceOf(params.owner, params.symbol);
  if (after === undefined || !token) return undefined;
  return Number(formatUnits(after - params.before, token.decimals));
}

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
  | { status: 'skipped'; reason: 'already_ran_this_period' | 'nothing_to_do' };

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
export const EXECUTABLE_KINDS = new Set(Object.keys(PLANNERS));

/**
 * Kinds whose size is decided by looking, not by configuration.
 *
 * A stop-loss closes what is held; a rebalance trades the drift. Neither has a meaningful "amount"
 * before the planner runs, and forcing one on them made the spend rules reject the only strategies
 * that exclusively reduce risk.
 */
export const SELF_SIZING_KINDS = new Set(['exit-rules', 'rebalance']);

/**
 * How many runs are on chain right now.
 *
 * Shutdown waits on this. A SIGTERM in the middle of a fill used to leave the `strategy_runs` row
 * claimed and never finished — and because the period key is unique, that period can never be
 * retried, so the strategy silently skips a day and the row sits `pending` forever. A deploy
 * should not cost a user their scheduled buy.
 */
let inFlight = 0;
export function inFlightRuns(): number {
  return inFlight;
}

export async function runStrategy(
  strategy: StrategyRow,
  at: Date = new Date(),
): Promise<RunOutcome> {
  inFlight += 1;
  try {
    return await runStrategyInner(strategy, at);
  } finally {
    inFlight -= 1;
  }
}

async function runStrategyInner(
  strategy: StrategyRow,
  at: Date = new Date(),
): Promise<RunOutcome> {
  const cadence = (strategy.cadence ?? 'daily') as Cadence;
  const key = periodKey(strategy.id, cadence, at);

  // ── 1. Claim the period, atomically. ──
  const runId = await tx(async (client) => claimRun(client, strategy.id, key));
  if (!runId) return { status: 'skipped', reason: 'already_ran_this_period' };

  const usd = Number(strategy.params.usd ?? strategy.daily_allocation_usd ?? 0);
  /*
   * What this ONE strategy may spend per day.
   *
   * Distinct from `usd`, which is the size of a single run: a strategy can legitimately run twice
   * in a day (a manual trigger alongside the schedule), and the allocation is what bounds the sum.
   * Zero means unbounded by this rule and bounded only by the delegation, which is the right
   * default for a self-sizing kind that has no configured amount.
   */
  const allocationUsd = Number(strategy.daily_allocation_usd ?? 0);
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

  /*
   * Some kinds size themselves.
   *
   * A recurring buy has a configured amount, so the spend rules apply to it directly. A stop-loss
   * does not: it closes whatever is held, and the size is only known once the planner has looked.
   * Running the spend rules against its configured 0 rejected it as "the amount must be above
   * zero" — the safety rail firing on the one strategy that only ever REDUCES risk.
   *
   * So for self-sizing kinds the amount checks are deferred to the planner, and the checks that
   * are about permission rather than size — expiry, revocation — still run for everything.
   */
  const selfSizing = SELF_SIZING_KINDS.has(strategy.kind);

  const verdict = await evaluate({
    walletId,
    usd: selfSizing ? Math.max(usd, 0.01) : usd,
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

    /*
     * Can the bot pay for the transaction at all?
     *
     * The delegate funds its own gas, and when that wallet runs dry every strategy fails inside
     * the venue call. The user is then told "the venue rejected the order", which sends them to
     * look at the market — for a problem that is entirely ours and has nothing to do with their
     * trade. It is the most predictable outage this system has, and it was invisible.
     *
     * Checked before anything is signed, so the run is blocked with the true reason and the day's
     * allowance is not consumed by an attempt that could never land.
     */
    const gas = await gasStatus().catch(() => null);
    if (gas && !gas.enough) {
      return finishBlocked(
        runId,
        walletId,
        strategy,
        'agent_out_of_gas',
        `The agent's wallet is down to ${gas.eth.toFixed(4)} ETH and cannot pay for a transaction. Your funds are untouched and nothing was placed.`,
      );
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
    // The daily cap limits SPENDING. A close does not spend, and a cap that can block a stop is a
    // cap that can stop a stop — so this check does not apply to a self-sizing, risk-reducing kind.
    if (!selfSizing && usd > policy.remainingTodayUsd) {
      return finishBlocked(
        runId,
        walletId,
        strategy,
        'onchain_daily_cap',
        `The contract allows ${policy.remainingTodayUsd.toFixed(2)} more today, and this asks for ${usd.toFixed(2)}.`,
      );
    }

    /*
     * What does THIS kind want to do?
     *
     * The planner decides the trade; every gate above decided whether a trade is allowed at all.
     * Keeping the two apart is what stops a new tier from arriving with its own copy of the safety
     * logic and getting it subtly wrong.
     */
    /*
     * Observe before deciding.
     *
     * A grid needs to know which rung it was on; a trailing stop needs the high-water mark updated
     * on the runs where it does NOT fire, which is most of them. Both are facts about the world
     * that the planner should be handed rather than go and fetch, so the observation happens here
     * and is persisted immediately — a peak that moved and was not written down is a peak the next
     * run will not trail from.
     */
    let params = strategy.params as Record<string, unknown>;
    const observed = await observationFor(strategy.kind, {
      owner,
      budgetUsd: usd,
      params,
      symbol: strategy.symbol,
    }).catch(() => null);
    if (observed) {
      await query(`UPDATE strategies SET params = params || $2::jsonb WHERE id = $1`, [
        strategy.id,
        JSON.stringify(observed),
      ]);
      params = { ...params, ...observed };
    }

    const intent: TradeIntent | null = await PLANNERS[strategy.kind]!({
      owner,
      budgetUsd: usd,
      params,
      symbol: strategy.symbol,
    });

    // "Nothing to do" is the right answer most of the time for a rebalance that has not drifted or
    // a stop that has not been hit. It is not a failure and must not read as one.
    if (!intent) {
      // The observation above has already been written, so a run that only looked still leaves a
      // record of what it saw — which is the difference between a grid warming up and one broken.
      if (observed && observed.lastLevel !== undefined) {
        return finishNoop(
          runId,
          walletId,
          strategy,
          `Took the first reading: ${strategy.symbol} is on rung ${observed.lastLevel} of your range. Trades start on the next crossing.`,
        );
      }
      if (observed && observed.peakPrice !== undefined) {
        return finishNoop(
          runId,
          walletId,
          strategy,
          `${strategy.symbol} made a new high of ${Number(observed.peakPrice).toFixed(2)}. Your trailing stop moved up with it.`,
        );
      }
      return finishNoop(
        runId,
        walletId,
        strategy,
        'Checked, and there was nothing to do this run.',
      );
    }

    /*
     * Some legs are not swaps.
     *
     * Supplying to a lending pool has no route to quote and no market price to look up: the
     * planner already built the calldata, and the receipt is 1:1 with what went in. Asking 1inch
     * to price "aUSDC" would 400 on a symbol it has never heard of, and `priceOf` would throw
     * before the trade got anywhere near the chain.
     */
    /*
     * The strategy's own daily allowance.
     *
     * The delegation caps the DAY across everything; nothing capped one strategy inside it. So a
     * rebalance that decided to move $1,800 could consume the whole cap and every DCA scheduled
     * after it would be blocked — by a limit the user set for the account, spent by a strategy
     * they had allocated $200 to. The account-level cap was doing the sub-cap's job and doing it
     * to whichever strategy happened to run first.
     *
     * Summed from `strategy_runs`, not a counter: derived from the rows that record what actually
     * happened, so there is nothing to keep in sync and nothing to drift.
     *
     * A close does not count, for the same reason it does not touch the on-chain cap — an
     * allowance is a limit on putting capital at risk, and a limit that blocks an exit traps you.
     */
    if (!isCloseIntent(intent) && allocationUsd > 0) {
      const spentRows = await query<{ spent: string | null }>(
        `SELECT COALESCE(SUM(usd), 0) AS spent
           FROM strategy_runs
          WHERE strategy_id = $1 AND status = 'filled' AND finished_at >= date_trunc('day', now() AT TIME ZONE 'UTC')`,
        [strategy.id],
      );
      const spentToday = Number(spentRows[0]?.spent ?? 0);
      const left = allocationUsd - spentToday;
      if (intent.usd > left + 0.005) {
        return finishBlocked(
          runId,
          walletId,
          strategy,
          'strategy_daily_allocation',
          `${strategy.label} is allocated $${allocationUsd.toLocaleString('en-US')} a day and has used $${spentToday.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. This asks for $${intent.usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
        );
      }
    }

    const price = intent.direct
      ? intent.direct.unitPriceUsd
      : await priceOf(intent.outSymbol === 'USDC' ? intent.inSymbol : intent.outSymbol);
    // How many units of the ASSET this leg moves — bought on a buy, sold on a close.
    const units = intent.outSymbol === 'USDC' ? intent.amountIn : intent.usd / price;

    // Real 1inch calldata. The delegation contract pulls the input and forwards this to the router
    // inside one transaction, so the user's funds are never parked anywhere in between — and the
    // bought token is delivered straight to the user's own wallet, never to the contract.
    //
    // A direct leg skips this entirely: the delegation forwards the planner's calldata to the
    // venue under exactly the same pull-approve-call-unapprove sequence, and the pool credits the
    // owner rather than us because `supply()` takes the recipient explicitly.
    const swap = intent.direct
      ? { to: intent.direct.venue, data: intent.direct.data }
      : await buildSwap({
          inSymbol: intent.inSymbol,
          outSymbol: intent.outSymbol,
          // In the INPUT token's units. Passing dollars here scaled a position into wei and the
          // router refused a trade orders of magnitude too large.
          amount: intent.amountIn,
          // On a whole-position close the planner has the chain's own figure; the delegation and
          // the router have to be handed the same one or the router reverts for the difference.
          amountRaw: intent.amountInRaw,
          from: DELEGATION_FROM,
          receiver: owner,
          // A risk-reducing close gets more room than a scheduled buy. See `SLIPPAGE`.
          slippagePct: isCloseIntent(intent) ? SLIPPAGE.stop : SLIPPAGE.scheduled,
        });

    /*
     * Buying and closing are different transactions.
     *
     * `spend()` measures against a daily cap denominated in the settlement token, so a sell cannot
     * go through it: 0.3e18 wei of WETH against a cap of 2000e6 USDC units is nonsense arithmetic,
     * and worse, a used-up spending cap would silence a stop-loss. `closePosition()` is separately
     * authorised by the same policy and does not touch the cap, because de-risking is not spending.
     */
    const payToken = VENUE_TOKENS[intent.inSymbol];
    if (!payToken) throw new Error(`No token registry entry for ${intent.inSymbol}`);

    // A direct leg is never a close: it puts capital to work rather than taking it off the table,
    // so it spends against the cap like any other outflow.
    const isClose = !intent.direct && intent.outSymbol === 'USDC';

    // Read before the transaction so the delta afterwards is the fill and nothing else.
    const balanceBefore = intent.direct
      ? undefined
      : await rawBalanceOf(owner, intent.outSymbol === 'USDC' ? intent.inSymbol : intent.outSymbol);
    const signature = isClose
      ? await closeAsDelegate({
          owner,
          token: payToken.address,
          venue: swap.to as Address,
          /*
           * In the SOLD token's own units, not dollars — and from the chain when the planner had
           * the exact figure. The float path overshot a real balance by 8 wei and reverted; a
           * partial sell can keep using it, because there the float IS the intended size.
           */
          amount: intent.amountInRaw ?? BigInt(Math.floor(intent.amountIn * 10 ** payToken.decimals)),
          data: swap.data,
        })
      : await spendAsDelegate({
          owner,
          token: payToken.address,
          venue: swap.to,
          usd: intent.usd,
          data: swap.data,
        });

    /*
     * What the fill ACTUALLY delivered, measured on chain.
     *
     * The units written to the book were `usd / price` — an estimate from the quote, not the
     * amount the router handed over. A $90 buy recorded 0.035879 WETH and delivered 0.035775, and
     * the difference stayed on the book forever as 0.0001 phantom units carrying $0.26 of cost.
     * Every entry price, every unrealised figure and every rebalance drift was computed against a
     * position that did not exist.
     *
     * So: wait for the receipt, then read the balance either side. Waiting is the right thing to
     * do regardless — recording a fill before it is mined is a race on any chain that does not
     * automine, and this executor is meant for one that does not.
     */
    let filledUnits = units;
    if (!intent.direct) {
      const settled = await waitForTx(signature).catch(() => false);
      if (!settled) throw new Error(`transaction ${signature} did not confirm`);
      const measured = await measuredDelta({
        owner,
        symbol: intent.outSymbol === 'USDC' ? intent.inSymbol : intent.outSymbol,
        before: balanceBefore,
      });
      // A close removes units; the delta is negative and the magnitude is what moved.
      if (measured !== undefined) filledUnits = Math.abs(measured);
    }

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
        `UPDATE strategy_runs SET status='filled', signature=$2, units=$3, price=$4, usd=$5, finished_at=now()
         WHERE id=$1`,
        // `usd` was never written on a fill, so the one column that records what a run COST was
        // empty for every run that cost anything. The per-strategy cap below is summed from it.
        [runId, signature, filledUnits, price, intent.usd],
      );
      /*
       * A supply is not a position, so it does not go in the position book.
       *
       * Tier 4 wrote an `aUSDC` row, which then appeared in Holdings priced at $0.00 — there is no
       * price feed for a receipt token — next to a real balance of $1,220. Worse, it was a second
       * record of something the chain already answers exactly: `suppliedUsd()` reads the aToken
       * and the portfolio total already includes it. Two sources for one fact, one of which can
       * drift and neither of which is more authoritative than the chain.
       *
       * A close reduces the position; a buy adds to it. A supply does neither.
       */
      if (intent.direct) {
        // nothing to book: the aToken balance IS the record, and it is read from the chain.
      } else await applyFill(client, {
        walletId,
        symbol: intent.outSymbol === 'USDC' ? intent.inSymbol : intent.outSymbol,
        units: intent.outSymbol === 'USDC' ? -filledUnits : filledUnits,
        usd: intent.outSymbol === 'USDC' ? -intent.usd : intent.usd,
      });
      // Closing is not spending, so it does not consume the day's allowance — the contract
      // agrees, and the two tallies must not disagree.
      if (!isClose) await recordSpend(walletId, intent.usd, client);
      await append(
        {
          walletId,
          agent: 'Yield Keeper',
          action: describeLeg(intent, filledUnits),
          detail: intent.direct
            ? `$${intent.usd.toLocaleString('en-US', { maximumFractionDigits: 2 })} moved. ${intent.because}`
            : `$${intent.usd.toLocaleString('en-US', { maximumFractionDigits: 2 })} at $${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}. ${intent.because}`,
          // Putting cash to work is not a trade, and the audit schema has had a 'yield' category
          // from the start that nothing ever wrote. Filing a supply as a trade makes the activity
          // filter lie about what the bot has been doing.
          kind: intent.direct ? 'yield' : 'trade',
          signature,
          payload: {
            runId,
            strategyId: strategy.id,
            units: filledUnits,
            price,
            usd,
            explorer: explorerTx(signature),
          },
        },
        client,
      );
      /*
       * Carry the strategy's state forward, in the SAME transaction as the fill.
       *
       * A grid that bought a rung and crashed before recording it would buy that rung again on
       * the next tick — the classic double-fill this executor is built to make impossible. The
       * period claim stops a repeat within one period; this stops a repeat across them.
       *
       * Merged rather than replaced, so a planner returning only the keys it changed cannot wipe
       * the user's own configuration.
       */
      if (intent.stateAfter) {
        await client.query(`UPDATE strategies SET params = params || $2::jsonb WHERE id = $1`, [
          strategy.id,
          JSON.stringify(intent.stateAfter),
        ]);
      }
      // Schedule the next one. Without this a strategy fills once and then sits there looking
      // live, which is indistinguishable from being broken.
      if (strategy.cadence) {
        await client.query(`UPDATE strategies SET next_run_at=$2 WHERE id=$1`, [
          strategy.id,
          advance(at, strategy.cadence),
        ]);
      }
    });

    /*
     * Tell the user.
     *
     * The bot trading while they are asleep is the product; them finding out is the other half of
     * it, and that half was never connected — `send()` existed and only `/notify/test` called it.
     * Deliberately outside the transaction and deliberately not awaited for correctness: a push
     * that fails must never roll back a trade that settled.
     */
    void send(walletId, {
      title: describeLeg(intent, filledUnits),
      body: intent.direct
        ? intent.because
        : `${filledUnits.toFixed(4)} at $${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}. ${intent.because}`,
      route: '/activity',
      kind: 'dca-executed',
    }).catch(() => undefined);

    return { status: 'filled', runId, signature, units: filledUnits, price };
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

/**
 * Is this leg reducing risk rather than taking it on?
 *
 * A close and a supply are both "not a scheduled buy", but only the close is urgent enough to pay
 * up for. Kept as one function so the slippage decision and the cap decision cannot drift apart.
 */
function isCloseIntent(intent: TradeIntent): boolean {
  return !intent.direct && intent.outSymbol === 'USDC';
}

/**
 * What this leg did, in the words a person would use.
 *
 * "Bought 100.0000 aUSDC" is technically what the receipt token says and tells the user nothing.
 * The action line in the activity log is the only place some people ever read what the bot did, so
 * it names the thing that happened, not the token that moved.
 */
function describeLeg(intent: TradeIntent, units: number): string {
  if (intent.direct) {
    return `Supplied $${intent.usd.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${intent.inSymbol} to Aave`;
  }
  return intent.outSymbol === 'USDC'
    ? `Sold ${units.toFixed(4)} ${intent.inSymbol}`
    : `Bought ${units.toFixed(4)} ${intent.outSymbol}`;
}

/**
 * The run happened, looked, and correctly did nothing.
 *
 * Distinct from `blocked`, which means a limit stopped it. Collapsing the two would make a healthy
 * rebalance look like a refused one every time the portfolio was already on target.
 */
async function finishNoop(
  runId: string,
  walletId: string,
  strategy: StrategyRow,
  detail: string,
): Promise<RunOutcome> {
  await tx(async (client) => {
    await client.query(
      `UPDATE strategy_runs SET status='skipped', error=NULL, finished_at=now() WHERE id=$1`,
      [runId],
    );
    if (strategy.cadence) {
      await client.query(`UPDATE strategies SET next_run_at=$2 WHERE id=$1`, [
        strategy.id,
        advance(new Date(), strategy.cadence),
      ]);
    }
    await append(
      {
        walletId,
        agent: 'Drawdown Guard',
        action: `Nothing to do for ${strategy.label}`,
        detail,
        kind: 'risk',
        payload: { runId, strategyId: strategy.id },
      },
      client,
    );
  });
  return { status: 'skipped', reason: 'nothing_to_do' };
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

  /*
   * A blocked run is the notification that matters most.
   *
   * "Your cap stopped a trade" and "your permission expired" are the two things a user needs to
   * hear without opening the app — they are the moments the safety layer did its job, and silence
   * would look identical to the bot simply not trying.
   */
  void send(walletId, {
    title: 'A trade was not placed',
    body: detail,
    route: '/activity',
    kind: 'strategy-blocked',
  }).catch(() => undefined);

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
    /*
     * 1inch's own errors, now that the delegation bubbles them instead of masking them.
     *
     * `ReturnAmountIsNotEnough` is the common one and used to arrive as VenueCallFailed, so a
     * trade blocked by a price move looked identical to malformed calldata. It is the difference
     * between "try again" and "something is broken", and the user is the one who has to decide.
     */
    '0x9a446475': 'The price moved more than your slippage limit while this was in flight. Nothing was placed.', // ReturnAmountIsNotEnough(uint256)
    '0xf32bec2f': 'The price moved more than your slippage limit while this was in flight. Nothing was placed.', // ReturnAmountIsNotEnough()
    '0xf4059071': 'The venue could not collect the token — the approval was short or withdrawn.', // SafeTransferFromFailed()
    '0x28ebf247': 'The route came back with nothing, so there was no trade to make.', // ZeroReturnAmount()
  };
  const selector = /(?:custom error|reverted with|signature)[^0-9a-fx]*(0x[0-9a-f]{8})\b/.exec(e)?.[1];
  if (selector && BY_SELECTOR[selector]) return BY_SELECTOR[selector];

  // Named errors, when the RPC decodes them for us.
  if (e.includes('dailycapexceeded')) return BY_SELECTOR['0x3e814127']!;
  if (e.includes('policyrevoked')) return BY_SELECTOR['0x430f7460']!;
  if (e.includes('policyexpired')) return BY_SELECTOR['0x9c5bebca']!;
  if (e.includes('venuenotallowed')) return BY_SELECTOR['0x2114fba2']!;
  if (e.includes('notdelegate')) return BY_SELECTOR['0x1db3b859']!;
  if (e.includes('returnamountisnotenough')) return BY_SELECTOR['0x9a446475']!;

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
