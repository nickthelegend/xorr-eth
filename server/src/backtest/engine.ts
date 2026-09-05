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

const COINGECKO = 'https://api.coingecko.com/api/v3';

const IDS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  XRP: 'ripple',
  DOGE: 'dogecoin',
  HYPE: 'hyperliquid',
  AAVE: 'aave',
  LINK: 'chainlink',
  TON: 'the-open-network',
};

export type Lookback = '30d' | '90d' | '6m' | '1y';

const DAYS: Record<Lookback, number> = { '30d': 30, '90d': 90, '6m': 180, '1y': 365 };

/** design.md §6 "Area / equity curve". */
const VB_W = 360;
const VB_H = 110;

export type BacktestResult = {
  lookback: Lookback;
  ret: number;
  maxDd: number;
  sharpe: number;
  trades: number;
  curve: string;
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

  const json = await getJson<{ prices?: [number, number][] }>(
    `${COINGECKO}/coins/${id}/market_chart?vs_currency=usd&days=${days}&interval=daily`,
    // History changes once a day; caching it hard is both correct and kind to the upstream.
    10 * 60_000,
  );
  const prices = json.prices ?? [];
  if (prices.length < 5) throw new Error(`not enough history for ${symbol}`);
  cache.set(key, { at: Date.now(), prices });
  return prices;
}

/** Equity series -> the polyline design.md draws. */
export function curveFrom(equity: readonly number[]): string {
  if (equity.length === 0) return '';
  const hi = Math.max(...equity);
  const lo = Math.min(...equity);
  const span = hi - lo || 1;
  const step = equity.length > 1 ? VB_W / (equity.length - 1) : 0;
  // Downsample to ~40 points: a 365-point polyline is unreadable at 360px wide.
  const stride = Math.max(1, Math.floor(equity.length / 40));
  const pts: string[] = [];
  for (let i = 0; i < equity.length; i += stride) {
    const y = ((hi - equity[i]!) / span) * (VB_H - 10) + 5;
    pts.push(`${(i * step).toFixed(1)},${y.toFixed(1)}`);
  }
  const lastY = ((hi - equity[equity.length - 1]!) / span) * (VB_H - 10) + 5;
  pts.push(`${VB_W},${lastY.toFixed(1)}`);
  return pts.join(' ');
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
    curve: curveFrom(equity),
    feed: 'live',
    source: 'coingecko market_chart, daily closes',
    disclaimer: 'Nothing here is a promise.',
  };
}
