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
   * State the strategy should carry into its next run, written with the fill.
   *
   * Most tiers are stateless: a rebalance re-reads the portfolio, a stop re-reads the price. A
   * grid is not — it has to remember which rungs it already bought, or it buys the same rung on
   * every tick. Persisting it in the SAME transaction as the fill is what stops the two from
   * disagreeing after a crash: a lot that was bought but not recorded would be bought again.
   */
  stateAfter?: Record<string, unknown>;
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
  const trailConfigured = Number(ctx.params.trailPct ?? 0) > 0;
  if (!(entry > 0) || (!takeProfitPct && !stopLossPct && !trailConfigured)) return null;

  const held = (await holdings(ctx.owner)).find((h) => h.symbol === ctx.symbol);
  if (!held || held.usd < MIN_TRADE_USD) return null;

  const mark = await priceOf(ctx.symbol);
  const movePct = ((mark - entry) / entry) * 100;

  const hitTP = takeProfitPct > 0 && movePct >= takeProfitPct;
  const hitSL = stopLossPct > 0 && movePct <= -Math.abs(stopLossPct);

  /*
   * A trailing stop: a fixed distance below the best price seen since entry.
   *
   * The one people actually ask for, because a fixed stop either sits too close and gets taken out
   * by noise, or too far and gives back the whole move. `peakPrice` is maintained by
   * `observationFor` on every run — including the ones where nothing fires, which is most of them
   * and is exactly when the trailing has to happen.
   */
  const trailPct = Number(ctx.params.trailPct ?? 0);
  const peak = Number(ctx.params.peakPrice ?? 0);
  const trailFloor = trailPct > 0 && peak > 0 ? peak * (1 - trailPct / 100) : 0;
  const hitTrail = trailFloor > 0 && mark <= trailFloor;

  if (!hitTP && !hitSL && !hitTrail) return null;

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
      : hitSL
        ? `${ctx.symbol} is down ${Math.abs(movePct).toFixed(1)}% from ${entry.toFixed(2)}, which is your stop.`
        : `${ctx.symbol} fell ${trailPct}% from its high of ${peak.toFixed(2)}, which is your trailing stop.`,
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
 * Tier 5 — range accumulation.
 *
 * The user draws a band and the bot buys a rung lower and sells a rung higher inside it. Fifth on
 * the ladder because it forecasts nothing — but it does ASSUME something, which is why it sits
 * above the tiers that assume nothing at all: it assumes the range holds. A range that breaks
 * leaves you holding everything you bought on the way down, and the honest thing is to say so
 * rather than keep buying.
 *
 * Rungs are crossings, not levels. Acting on "the price is below rung 3" would buy rung 3 again
 * on every tick for as long as the price stayed there; acting on "the price has CROSSED rung 3
 * since we last looked" buys it once. That is what `lastLevel` is for, and it is why the first run
 * of a grid deliberately trades nothing — there is no previous position to have crossed from, and
 * inventing one would put on a position the user did not ask for at a price nobody chose.
 */
export async function planGrid(ctx: PlanContext): Promise<TradeIntent | null> {
  const lower = Number(ctx.params.lower ?? NaN);
  const upper = Number(ctx.params.upper ?? NaN);
  const steps = Math.floor(Number(ctx.params.steps ?? 4));
  const usdPerStep = Number(ctx.params.usdPerStep ?? ctx.budgetUsd);
  if (!(lower > 0) || !(upper > lower) || !(steps >= 1) || !(usdPerStep >= MIN_TRADE_USD)) {
    return null;
  }

  const price = await priceOf(ctx.symbol);
  if (!(price > 0)) return null;

  /*
   * Outside the band, do nothing — and record that it left.
   *
   * A grid whose range has broken should stop, not keep averaging down past the floor its owner
   * drew. The state flag is what lets the next run say "your range broke" instead of silently
   * doing nothing forever, which looks identical to being switched off.
   */
  const openLots = Array.isArray(ctx.params.openLots) ? (ctx.params.openLots as number[]) : [];
  if (price < lower || price > upper) {
    return null;
  }

  // Rung prices, low to high. `steps` gaps means `steps + 1` rungs.
  const rungs = Array.from({ length: steps + 1 }, (_, i) => lower + (i * (upper - lower)) / steps);
  // How many rungs the price is at or above — the rung the price is currently standing on.
  const level = rungs.filter((r) => price >= r).length - 1;

  const lastLevel = Number.isFinite(Number(ctx.params.lastLevel))
    ? Number(ctx.params.lastLevel)
    : null;

  // First sight of the price: take a reading, place nothing.
  if (lastLevel === null) return null;
  if (level === lastLevel) return null;

  if (level < lastLevel) {
    // Fell through a rung. Buy that rung, once, and remember we hold it.
    if (openLots.includes(level)) return null;
    const size = Math.min(usdPerStep, ctx.budgetUsd);
    if (size < MIN_TRADE_USD) return null;
    return {
      inSymbol: 'USDC',
      outSymbol: ctx.symbol === 'ETH' ? 'WETH' : ctx.symbol,
      amountIn: size,
      usd: size,
      because: `${ctx.symbol} fell through ${rungs[level]!.toFixed(2)} inside your range.`,
      stateAfter: { lastLevel: level, openLots: [...openLots, level] },
    };
  }

  /*
   * Rose through a rung. Sell the lowest lot we are holding — the one bought cheapest, which is
   * the one this rung's rise has actually made a profit on. Selling the most recent instead would
   * book the smallest gain available and leave the cheap lot exposed to the range breaking.
   */
  const lot = openLots.length ? Math.min(...openLots) : undefined;
  if (lot === undefined) {
    // Nothing held, so nothing to sell. Move the marker so the next fall is a real crossing.
    return null;
  }
  const held = (await holdings(ctx.owner)).find((h) => h.symbol === ctx.symbol);
  if (!held || held.usd < MIN_TRADE_USD) return null;

  const size = Math.min(usdPerStep, held.usd);
  return {
    inSymbol: ctx.symbol,
    outSymbol: 'USDC',
    amountIn: size / price,
    usd: size,
    because: `${ctx.symbol} rose through ${rungs[level]!.toFixed(2)}, closing the lot bought at ${rungs[lot]!.toFixed(2)}.`,
    stateAfter: { lastLevel: level, openLots: openLots.filter((l) => l !== lot) },
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
  grid: planGrid,
};

/**
 * What a strategy needs to REMEMBER before it can decide anything, updated every run.
 *
 * Two tiers need this and they need it for the same reason: they act on a change rather than on a
 * level, and a change can only be seen against something previously recorded.
 *
 *   - A grid trades on crossings, so its first run has nothing to have crossed from.
 *   - A trailing stop trails the high-water mark, which has to be updated on the runs where it
 *     does NOT fire. Updating it only on a fill would leave the stop pinned to the price at
 *     entry, which is an ordinary stop wearing a trailing stop's name.
 *
 * Deliberately separate from the planner and run BEFORE it, so the planner sees the current
 * observation and stays a pure function of what it is given.
 */
export async function observationFor(
  kind: string,
  ctx: PlanContext,
): Promise<Record<string, unknown> | null> {
  if (kind === 'grid') {
    if (Number.isFinite(Number(ctx.params.lastLevel))) return null;
    const lower = Number(ctx.params.lower ?? NaN);
    const upper = Number(ctx.params.upper ?? NaN);
    const steps = Math.floor(Number(ctx.params.steps ?? 4));
    if (!(lower > 0) || !(upper > lower) || !(steps >= 1)) return null;

    const price = await priceOf(ctx.symbol).catch(() => 0);
    if (!(price > 0)) return null;
    const rungs = Array.from({ length: steps + 1 }, (_, i) => lower + (i * (upper - lower)) / steps);
    const level = Math.max(rungs.filter((r) => price >= r).length - 1, 0);
    return { lastLevel: level, openLots: [] };
  }

  if (kind === 'exit-rules') {
    const trailPct = Number(ctx.params.trailPct ?? NaN);
    if (!Number.isFinite(trailPct) || trailPct <= 0) return null;
    const price = await priceOf(ctx.symbol).catch(() => 0);
    if (!(price > 0)) return null;
    /*
     * The high-water mark only ever goes up.
     *
     * That is the whole mechanism: the stop is a fixed distance below the best price seen since
     * the position was opened, so it follows a rise and never follows a fall. Seeding it from the
     * entry price rather than from today's mark matters — seeding from the mark on a position
     * already underwater would place the stop below where it should be and let the loss run.
     */
    const entry = Number(ctx.params.entryPrice ?? 0);
    const peak = Number(ctx.params.peakPrice ?? 0);
    const seed = peak > 0 ? peak : Math.max(entry, 0);
    if (price > seed) return { peakPrice: price };
    if (seed > 0 && peak === 0) return { peakPrice: seed };
    return null;
  }

  return null;
}
