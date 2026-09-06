/**
 * The backtest engine — PLAN.md 12.22 / 9.14, closing [G32].
 *
 * Screen 17's copy promises "run against real history at your current limits". The handoff
 * shipped four hardcoded rows. This replays a strategy over REAL price history from the same feed
 * the app quotes, at the user's ACTUAL daily cap, and returns computed statistics plus an equity
 * curve in the 360x110 viewBox design.md §6 specifies.
 *
 * It is deliberately conservative: fees and slippage are charged on every fill, and the result
 * carries a disclaimer, because screen 17 also says "Nothing here is a promise."
 */
import { getJson } from '../http/get.js';
import { COINGECKO_IDS } from '../market/ids.js';

const COINGECKO = 'https://api.coingecko.com/api/v3';

/*
 * The canonical map, not a second copy of it.
 *
 * This module kept its own nine-entry table with no WETH and no cbBTC — the two symbols the
 * executor actually trades — so backtesting the thing a user was about to run returned "no price
 * history for WETH". A private duplicate of a shared fact is a bug waiting for the shared fact to
 * grow, and this one had already been waiting.
 */
const IDS = COINGECKO_IDS;

export type Lookback = '30d' | '90d' | '6m' | '1y';

const DAYS: Record<Lookback, number> = { '30d': 30, '90d': 90, '6m': 180, '1y': 365 };

/** design.md §6 "Area / equity curve". */
/** About this many points survive the downsample — see `curvePoints`. */
const CURVE_POINTS = 40;

export type BacktestResult = {
  lookback: Lookback;
  ret: number;
  maxDd: number;
  sharpe: number;
  trades: number;
  /**
   * The equity series, downsampled for drawing. NUMBERS, not an SVG polyline.
   *
   * This used to be `curve: string` — the executor projected the series into a 360×110
   * viewBox and shipped that. Two things were wrong with it: the executor was doing the
   * chart's job (and had to know the chart's dimensions to do it), and the real values were
   * discarded, so the client could not label an axis, show a tooltip, or say what the line
   * was worth at any point. The chart scales a series itself; give it the series.
   */
  equity: number[];
  /** Honesty fields the UI can surface — a backtest with no context is a sales pitch. */
  feed: 'live';
  source: string;
  disclaimer: string;
};

const cache = new Map<string, { at: number; prices: [number, number][] }>();
const TTL_MS = 10 * 60_000;

async function history(symbol: string, days: number): Promise<[number, number][]> {
  const id = IDS[symbol];
  if (!id) throw new Error(`No price history for ${symbol}`);
  const key = `${id}:${days}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.prices;

  /*
   * One request per symbol, ever — the longest window, sliced.
   *
   * A longer series contains every shorter one, so there is no reason to ask the upstream twice.
   * It used to fetch per lookback, and against a tier that rate-limits each cold call waited out
   * its own retry ladder: a first `90d` backtest measured **118 seconds**, then `1y` another 63,
   * on a screen that promises "run against real history at your current limits". Fetching the
   * full span once makes the first backtest of a symbol the only slow one and every other
   * lookback instant — and it makes them provably the same data over different spans rather than
   * separate fetches that could disagree.
   */
  const cached = [...cache.entries()].find(
    ([k, e]) =>
      k.startsWith(`${id}:`) &&
      Date.now() - e.at < TTL_MS &&
      Number(k.slice(id.length + 1)) >= days,
  );
  if (cached) {
    const slice = cached[1].prices.slice(-(days + 1));
    if (slice.length >= 5) {
      cache.set(key, { at: cached[1].at, prices: slice });
      return slice;
    }
  }

  /** The longest span the app offers. Asking for it is what makes every other lookback free. */
  const span = Math.max(...Object.values(DAYS));

  /*
   * No `interval=daily` — the granularity is ours to impose.
   *
   * `interval=daily` is a paid-plan parameter on CoinGecko's public API: a keyless caller sending
   * it is making a request it is not entitled to, which is one more way for a lookback to fail
   * that has nothing to do with the data being available.
   *
   * But it was doing real work. Without it the API granulates by range — hourly from 2 to 90
   * days, daily beyond — so a 90-day backtest silently became 2,160 hourly points and ran
   * twenty-four times as many buys as a weekly schedule should. Asking for the range and taking
   * one sample per day gives the same series the parameter would have, from data we are allowed
   * to ask for.
   */
  const json = await getJson<{ prices?: [number, number][] }>(
    `${COINGECKO}/coins/${id}/market_chart?vs_currency=usd&days=${span}`,
    // History changes once a day; caching it hard is both correct and kind to the upstream.
    10 * 60_000,
  );
  const full = daily(json.prices ?? []);
  if (full.length < 5) throw new Error(`not enough history for ${symbol}`);
  cache.set(`${id}:${span}`, { at: Date.now(), prices: full });
  const prices = full.slice(-(days + 1));
  cache.set(key, { at: Date.now(), prices });
  return prices;
}

/**
 * One sample per UTC day — the last of each, which is that day's close.
 *
 * A no-op on a series that is already daily, so the same code serves every lookback.
 */
export function daily(points: [number, number][]): [number, number][] {
  const byDay = new Map<number, [number, number]>();
  for (const p of points) byDay.set(Math.floor(p[0] / 86_400_000), p);
  return [...byDay.values()].sort((a, b) => a[0] - b[0]);
}

/**
 * Downsample an equity series for drawing, keeping the LAST point.
 *
 * A 365-point line is unreadable at phone width, so it thins to about 40 — but the final
 * value is the one the screen quotes beside the chart, so it is always kept: a line that
 * ends a stride short of the real close disagrees with the number next to it.
 */
export function curvePoints(equity: readonly number[], target = CURVE_POINTS): number[] {
  if (equity.length === 0) return [];
  const stride = Math.max(1, Math.floor(equity.length / target));
  const out: number[] = [];
  for (let i = 0; i < equity.length; i += stride) out.push(equity[i]!);
  const last = equity[equity.length - 1]!;
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

export function maxDrawdown(equity: readonly number[]): number {
  let peak = equity[0] ?? 0;
  let worst = 0;
  for (const v of equity) {
    if (v > peak) peak = v;
    const dd = peak > 0 ? ((v - peak) / peak) * 100 : 0;
    if (dd < worst) worst = dd;
  }
  return worst;
}

/** Annualised Sharpe from daily returns, zero risk-free rate. */
export function sharpeRatio(dailyReturns: readonly number[]): number {
  if (dailyReturns.length < 2) return 0;
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance =
    dailyReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / (dailyReturns.length - 1);
  const sd = Math.sqrt(variance);
  if (sd === 0) return 0;
  return (mean / sd) * Math.sqrt(365);
}

const FEE_PCT = 0.001; // 0.1%, matching the order ticket
const SLIPPAGE_PCT = 0.0005;

/**
 * Replay a recurring buy over real history.
 * `perRun` is capped by the user's actual daily cap — screen 17 promises "at your current limits".
 */
export async function backtestDca(params: {
  symbol: string;
  lookback: Lookback;
  perRunUsd: number;
  dailyCapUsd: number;
  everyNDays: number;
}): Promise<BacktestResult> {
  const days = DAYS[params.lookback];
  const prices = await history(params.symbol, days);
  const perRun = Math.min(params.perRunUsd, params.dailyCapUsd);

  let units = 0;
  let invested = 0;
  let trades = 0;
  const equity: number[] = [];

  for (let i = 0; i < prices.length; i++) {
    const px = prices[i]![1];
    if (i % params.everyNDays === 0) {
      const effective = px * (1 + SLIPPAGE_PCT);
      const spend = perRun * (1 - FEE_PCT);
      units += spend / effective;
      invested += perRun;
      trades += 1;
    }
    equity.push(units * px);
  }

  const finalValue = equity[equity.length - 1] ?? 0;
  const ret = invested > 0 ? ((finalValue - invested) / invested) * 100 : 0;

  // Drawdown and Sharpe measure the VALUE of what is held, net of contributions, so a schedule
  // that keeps adding capital does not look like a rising strategy when it is only a rising float.
  const perUnit = prices.map(([, p]) => p);
  const dailyReturns: number[] = [];
  for (let i = 1; i < perUnit.length; i++) {
    dailyReturns.push((perUnit[i]! - perUnit[i - 1]!) / perUnit[i - 1]!);
  }

  return {
    lookback: params.lookback,
    ret: Number(ret.toFixed(1)),
    maxDd: Number(maxDrawdown(perUnit).toFixed(1)),
    sharpe: Number(sharpeRatio(dailyReturns).toFixed(1)),
    trades,
    equity: curvePoints(equity),
    feed: 'live',
    source: 'coingecko market_chart, daily closes',
    disclaimer: 'Nothing here is a promise.',
  };
}

export type GridBacktest = BacktestResult & {
  /** How much of the window the price actually spent inside the band. */
  inRangePct: number;
  buys: number;
  sells: number;
  /** Units still held at the end — the position a broken range leaves you with. */
  unitsLeft: number;
  /** What those units are worth at the last price, and what they cost. */
  leftValue: number;
  leftCost: number;
};

/**
 * A grid, replayed over real daily closes.
 *
 * This is the tier where a backtest earns its keep. A grid's entire risk is the assumption in its
 * own description — that the range holds — and that is a question about history, not about the
 * future: "over the last ninety days, how much of the time was the price actually inside the band
 * I am about to draw?" A user who sees 41% has learned something a projection could never tell
 * them.
 *
 * It replays the SAME rules the executor runs: rungs are crossings, a rung is bought once, a rise
 * closes the cheapest lot, and the whole thing stops outside the band. A backtest of different
 * rules than the ones that will run is worse than none, because it is believed.
 */
export async function backtestGrid(params: {
  symbol: string;
  lookback: Lookback;
  lower: number;
  upper: number;
  steps: number;
  usdPerStep: number;
}): Promise<GridBacktest> {
  const { lower, upper, steps, usdPerStep } = params;
  const prices = await history(params.symbol, DAYS[params.lookback]);
  const rungs = Array.from({ length: steps + 1 }, (_, i) => lower + (i * (upper - lower)) / steps);
  const levelOf = (px: number) => rungs.filter((r) => px >= r).length - 1;

  /** Open lots, keyed by the rung they were bought at, holding the units acquired there. */
  const lots = new Map<number, number>();
  let lastLevel: number | null = null;
  let invested = 0;
  let realised = 0;
  let buys = 0;
  let sells = 0;
  let inRange = 0;
  const equity: number[] = [];

  for (const [, px] of prices) {
    const inside = px >= lower && px <= upper;
    if (inside) inRange += 1;

    if (!inside) {
      // Outside the band the executor stops. Holding still has value, so the curve continues.
      equity.push([...lots.values()].reduce((a, u) => a + u * px, 0) + realised);
      continue;
    }

    const level = levelOf(px);
    if (lastLevel === null) {
      lastLevel = level;
    } else if (level < lastLevel && !lots.has(level)) {
      const effective = px * (1 + SLIPPAGE_PCT);
      const spend = usdPerStep * (1 - FEE_PCT);
      lots.set(level, spend / effective);
      invested += usdPerStep;
      buys += 1;
      lastLevel = level;
    } else if (level > lastLevel && lots.size > 0) {
      // The cheapest lot, exactly as the planner does — it is the one the rise has made a profit
      // on, and closing the newest instead books the smallest gain available.
      const cheapest = Math.min(...lots.keys());
      const units = lots.get(cheapest)!;
      lots.delete(cheapest);
      const effective = px * (1 - SLIPPAGE_PCT);
      realised += units * effective * (1 - FEE_PCT);
      sells += 1;
      lastLevel = level;
    } else if (level !== lastLevel) {
      lastLevel = level;
    }

    equity.push([...lots.values()].reduce((a, u) => a + u * px, 0) + realised);
  }

  const lastPx = prices[prices.length - 1]?.[1] ?? 0;
  const unitsLeft = [...lots.values()].reduce((a, u) => a + u, 0);
  const leftValue = unitsLeft * lastPx;
  const finalValue = leftValue + realised;
  const ret = invested > 0 ? ((finalValue - invested) / invested) * 100 : 0;

  const perUnit = prices.map(([, p]) => p);
  const dailyReturns: number[] = [];
  for (let i = 1; i < perUnit.length; i++) {
    dailyReturns.push((perUnit[i]! - perUnit[i - 1]!) / perUnit[i - 1]!);
  }

  return {
    lookback: params.lookback,
    ret: Number(ret.toFixed(1)),
    maxDd: Number(maxDrawdown(equity.length ? equity : perUnit).toFixed(1)),
    sharpe: Number(sharpeRatio(dailyReturns).toFixed(1)),
    trades: buys + sells,
    buys,
    sells,
    equity: curvePoints(equity),
    inRangePct: prices.length ? Number(((inRange / prices.length) * 100).toFixed(0)) : 0,
    unitsLeft: Number(unitsLeft.toFixed(6)),
    leftValue: Number(leftValue.toFixed(2)),
    /*
     * What the open lots COST, not what they are worth.
     *
     * The difference between these two is the honest answer to "what happens if the range breaks",
     * and it is the number a grid's marketing never shows.
     */
    leftCost: Number((lots.size * usdPerStep).toFixed(2)),
    feed: 'live',
    source: 'coingecko market_chart, daily closes',
    disclaimer: 'Nothing here is a promise. A range that held is not a range that will hold.',
  };
}
