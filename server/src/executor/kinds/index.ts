/**
 * What each strategy kind wants to do this run.
 *
 * A planner answers "what trade, if any" and nothing else. Whether the trade is ALLOWED is decided
 * once, by the gates in run.ts — the on-chain cap, the expiry, the revocation flag, the venue
 * allowlist and the Graph check. Keeping those in one place is the point: a second tier with its
 * own copy of the safety logic is a second tier that can get it wrong.
 *
 * A planner that returns null is not a failure. "Nothing to do" is the correct answer most of the
 * time for a rebalance that has not drifted or a stop that has not been hit, and it must not read
 * as an error in the activity log.
 */
import { priceOf } from '../../market/prices.js';
import { holdings, cashUsd } from '../../evm/balances.js';
import { usdcReserve } from '../../market/yield.js';
import { supplyCalldata, AAVE_POOL } from '../../venues/aave.js';
import { publicClient } from '../../evm/client.js';
import { usdToUnits } from '../../evm/delegation.js';
import { ADDRESSES } from '../../evm/chains.js';
import type { Address, Hex } from 'viem';

/**
 * One leg.
 *
 * `amountIn` is in the INPUT token's own units — dollars when paying with USDC, coins when selling
 * a holding. It is separate from `usd` because conflating them scaled a $1,500 position into
 * 1500e18 wei of WETH and the router refused a trade a hundred thousand times too large.
 *
 * `usd` is the dollar value of the leg, for the cap check and the activity log only.
 */
export type TradeIntent = {
  inSymbol: string;
  outSymbol: string;
  amountIn: number;
  usd: number;
  /** Shown in the activity log, so a user can see WHY this trade happened. */
  because: string;
  /**
   * The exact on-chain amount, when the planner knows it.
   *
   * A whole-position close must move the balance the chain actually holds. `amountIn` is a float
   * and cannot represent a wei count — converting it back overshot a real WETH balance by 8 wei
   * and the transfer reverted, which on a stop-loss is the worst possible time for a rounding
   * error. Set for a full close; absent for a sized trade, where a float is the right precision.
   */
  amountInRaw?: bigint;
  /**
   * Not every leg is a swap.
   *
   * Supplying to a lending pool moves the same capital under the same daily cap, but there is no
   * router to quote and no output token to price — the calldata is the whole trade. When this is
   * set the executor calls `venue` with `data` instead of asking 1inch for a route, and takes
   * `unitPriceUsd` as the price rather than looking one up. Leaving it undefined is the swap path,
   * unchanged.
   */
  direct?: { venue: Address; data: Hex; unitPriceUsd: number };
};

export type PlanContext = {
  owner: Address;
  /** What this run is allowed to spend, already capped by policy and by `decide()`. */
  budgetUsd: number;
  params: Record<string, unknown>;
  symbol: string;
};

/** Below this a rebalance is noise: the drift costs less than the gas and the spread. */
const MIN_TRADE_USD = 5;

/**
 * Tier 2 — rebalance to target weights.
 *
 * Deterministic, and the only input is the user's own target. It trades the single largest drift
 * rather than every sleeve at once: one leg per run is easier to read in the activity log, easier
 * to reverse, and converges just as well across runs.
 */
export async function planRebalance(ctx: PlanContext): Promise<TradeIntent | null> {
  const targets = ctx.params.targets as Record<string, number> | undefined;
  if (!targets || Object.keys(targets).length === 0) return null;

  /*
   * Weights are percentages of the WHOLE portfolio, and whatever is not targeted is cash.
   *
   * Normalising by the sum of the targets was wrong and quietly so: a single `{ WETH: 60 }` became
   * 60/60 = 100%, so a "hold 60% WETH" instruction would have bought until nothing was left. A
   * target list that sums past 100 is a user error, not something to renormalise away.
   */
  const totalWeight = Object.values(targets).reduce((a, b) => a + b, 0);
  if (totalWeight <= 0 || totalWeight > 100) return null;

  const [cash, held] = await Promise.all([cashUsd(ctx.owner), holdings(ctx.owner)]);
  const heldUsd = new Map(held.map((h) => [h.symbol, h.usd]));
  const portfolio = cash + held.reduce((a, h) => a + h.usd, 0);
  if (portfolio < MIN_TRADE_USD) return null;

  // The sleeve furthest BELOW its target is the one to buy. Selling the furthest-above is the
  // mirror case and is handled the same way, with the legs swapped.
  let worst: { symbol: string; driftUsd: number } | null = null;
  for (const [symbol, weight] of Object.entries(targets)) {
    const targetUsd = portfolio * (weight / 100);
    const driftUsd = targetUsd - (heldUsd.get(symbol) ?? 0);
    if (!worst || Math.abs(driftUsd) > Math.abs(worst.driftUsd)) worst = { symbol, driftUsd };
  }
  if (!worst) return null;

  const size = Math.min(Math.abs(worst.driftUsd), ctx.budgetUsd);
  if (size < MIN_TRADE_USD) return null;

  const pct = ((Math.abs(worst.driftUsd) / portfolio) * 100).toFixed(1);
  if (worst.driftUsd > 0) {
    return {
      inSymbol: 'USDC',
      outSymbol: worst.symbol,
      amountIn: size,
      usd: size,
      because: `${worst.symbol} is ${pct}% under its target weight.`,
    };
  }
  // Selling: the amount has to be in coins, not dollars.
  const price = await priceOf(worst.symbol);
  if (!(price > 0)) return null;
  return {
    inSymbol: worst.symbol,
    outSymbol: 'USDC',
    amountIn: size / price,
    usd: size,
    because: `${worst.symbol} is ${pct}% over its target weight.`,
  };
}

/**
 * Tier 3 — take profit and stop loss.
 *
 * It can only CLOSE. That is the whole reason this tier sits below momentum in the ladder: a
 * strategy that can only reduce risk is easy to hand over, and one that can open positions is not.
 * There is no branch here that buys.
 */
export async function planExitRules(ctx: PlanContext): Promise<TradeIntent | null> {
  const entry = Number(ctx.params.entryPrice ?? 0);
  const takeProfitPct = Number(ctx.params.takeProfitPct ?? 0);
  const stopLossPct = Number(ctx.params.stopLossPct ?? 0);
  if (!(entry > 0) || (!takeProfitPct && !stopLossPct)) return null;

  const held = (await holdings(ctx.owner)).find((h) => h.symbol === ctx.symbol);
  if (!held || held.usd < MIN_TRADE_USD) return null;

  const mark = await priceOf(ctx.symbol);
  const movePct = ((mark - entry) / entry) * 100;

  const hitTP = takeProfitPct > 0 && movePct >= takeProfitPct;
  const hitSL = stopLossPct > 0 && movePct <= -Math.abs(stopLossPct);
  if (!hitTP && !hitSL) return null;

  return {
    inSymbol: ctx.symbol,
    outSymbol: 'USDC',
    // Close the whole position. A partial close on a stop is a decision the user did not make.
    amountIn: held.units,
    // And close it to the wei, not to whatever a float rounds to.
    amountInRaw: held.raw,
    usd: held.usd,
    because: hitTP
      ? `${ctx.symbol} is up ${movePct.toFixed(1)}% from ${entry.toFixed(2)}, which is your take profit.`
      : `${ctx.symbol} is down ${Math.abs(movePct).toFixed(1)}% from ${entry.toFixed(2)}, which is your stop.`,
  };
}

/**
 * Tier 1 — recurring buy. A fixed amount, on a schedule. The bot picks nothing.
 */
export function planDca(ctx: PlanContext): TradeIntent {
  return {
    inSymbol: 'USDC',
    outSymbol: ctx.symbol === 'ETH' ? 'WETH' : ctx.symbol,
    amountIn: ctx.budgetUsd,
    usd: ctx.budgetUsd,
    because: 'Scheduled recurring buy.',
  };
}

/**
 * Tier 4 — move idle cash to yield.
 *
 * Idle USDC earns nothing. This supplies it to Aave v3 and the user holds the aToken directly,
 * because `supply()` takes the recipient as an argument — so the delegation is a conduit for one
 * transaction and holds nothing afterwards. That is the only reason this venue belongs inside a
 * non-custodial permission at all.
 *
 * Three things must be true before it moves anything, and each of them has stopped a real run:
 *
 *  - The reserve has to answer. Aave returns a ZEROED struct for an asset it does not list rather
 *    than reverting, so "0.00% a year" is what a wrong address looks like. Moving cash into a
 *    venue whose rate we could not read is the exact opposite of what this tier is for.
 *  - The pool has to have code on the chain we settle on. Aave v3 is not at this address on Base
 *    Sepolia; without this check the run would reach the chain and die inside `spend()` as an
 *    opaque VenueCallFailed, which reads to a user as "your trade broke" rather than "this
 *    network has no lending pool".
 *  - There has to be genuinely idle cash. `keepCashUsd` is the buffer the user does not want
 *    swept, and it defaults to leaving something behind rather than to zero: a strategy that
 *    empties the spendable balance stops every other strategy the account has.
 */
export async function planYieldRotation(ctx: PlanContext): Promise<TradeIntent | null> {
  const keepCashUsd = Number(ctx.params.keepCashUsd ?? 25);
  const minMoveUsd = Math.max(Number(ctx.params.minMoveUsd ?? 25), MIN_TRADE_USD);

  const reserve = await usdcReserve();

  // Aave's USDC reserve is a mainnet deployment. A fork of mainnet has it; a testnet does not, and
  // finding that out inside the delegation call would surface as an unexplained venue failure.
  const code = await publicClient.getCode({ address: AAVE_POOL }).catch(() => undefined);
  if ((code?.length ?? 0) <= 4) return null;

  // Same reason the yield module pins mainnet USDC: supplying the wrong asset to a real pool is
  // not a failure that reverts cleanly.
  if (ADDRESSES.usdcBase.toLowerCase() !== reserve.asset.toLowerCase()) return null;

  const cash = await cashUsd(ctx.owner);
  const idle = cash - keepCashUsd;
  if (idle < minMoveUsd) return null;

  const size = Math.min(idle, ctx.budgetUsd);
  if (size < minMoveUsd) return null;

  /*
   * The calldata amount and the amount `spend()` pulls have to be the SAME number.
   *
   * `spend()` pulls `usdToUnits(usd)` and approves the venue for exactly that, so calldata asking
   * for a rounded-up amount would exceed the approval and revert, and a rounded-down one would
   * strand dust in the delegation contract. Deriving both from one function is what keeps them
   * equal; `usd` below is deliberately the round-tripped value, not the raw float.
   */
  const amountRaw = usdToUnits(size);
  const usd = Number(amountRaw) / 1e6;

  return {
    inSymbol: 'USDC',
    outSymbol: 'aUSDC',
    amountIn: usd,
    usd,
    because: `${(reserve.apy * 100).toFixed(2)}% a year on Aave v3, and this cash was sitting idle.`,
    direct: {
      venue: reserve.pool,
      data: supplyCalldata({ asset: reserve.asset, amountRaw, owner: ctx.owner }),
      // A dollar of USDC supplied is a dollar of aUSDC. The receipt is 1:1 at supply; the yield
      // arrives as the balance growing, not as the price moving.
      unitPriceUsd: 1,
    },
  };
}

/** Every kind that has a planner. A kind not listed here cannot run, and run.ts says so. */
export const PLANNERS: Record<string, (ctx: PlanContext) => Promise<TradeIntent | null> | TradeIntent | null> = {
  dca: planDca,
  buy: planDca,
  'recurring-buy': planDca,
  rebalance: planRebalance,
  'exit-rules': planExitRules,
  'yield-rotation': planYieldRotation,
};
