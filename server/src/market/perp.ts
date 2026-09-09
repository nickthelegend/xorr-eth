/**
 * Perpetual metrics.
 *
 * `GET /perp/:symbol` did not exist. The screen called it, caught the 404, and rendered its empty
 * state — so a market that looked live was a market nothing had ever answered for.
 *
 * xorr does not run a perp venue and does not pretend to. What it CAN say truthfully is the mark
 * price (a real spot feed) and the funding schedule (a published 8-hour cadence every perp venue
 * shares). Everything that would require a venue's own order book — open interest, day volume, the
 * funding RATE — is not knowable from here, so it is returned as null and the screen labels it,
 * rather than filled with a plausible number.
 */
import { priceOf } from './prices.js';
import { isStock } from '../venues/stocks.js';
import { COINGECKO_IDS } from './ids.js';

export type PerpMetrics = {
  symbol: string;
  markPx: number;
  oraclePx: number;
  markVsIndex: number;
  openInterestUsd: number | null;
  dayVolumeUsd: number | null;
  fundingRate: number | null;
  maxLeverage: number;
  nextFundingSeconds: number;
  /** Absolute unix ms, so the client counts down purely rather than anchoring in an effect. */
  nextFundingAt: number;
  /** `live` means the mark is a real price. It never means every field is measured. */
  feed: 'live' | 'simulated';
  /** What is missing and why, so the screen can say it rather than imply it. */
  unavailable: string[];
};

/** Perp funding settles every 8 hours at 00:00, 08:00 and 16:00 UTC across every major venue. */
const FUNDING_INTERVAL_MS = 8 * 60 * 60 * 1000;

export function nextFundingAt(now = Date.now()): number {
  return Math.ceil(now / FUNDING_INTERVAL_MS) * FUNDING_INTERVAL_MS;
}

/** Long enough for a warm cache and a slow-but-working upstream; short enough to answer. */
const PRICE_DEADLINE_MS = 8_000;

/** The feed exists and did not answer in time — distinct from "this contract has no feed". */
export class PriceTooSlow extends Error {
  constructor(readonly symbol: string) {
    super(`The price feed for ${symbol} did not answer in time.`);
    this.name = 'PriceTooSlow';
  }
}

export async function perpMetrics(symbol: string): Promise<PerpMetrics | null> {
  const upper = symbol.toUpperCase();
  const at = nextFundingAt();

  /*
   * No spot feed means no mark, and a perp screen with no mark has nothing true to show.
   *
   * Uppercasing is correct here — `COINGECKO_IDS` is all-caps crypto — but it means a tokenized
   * equity falls through as a plain `null`, indistinguishable from a symbol nobody has heard of.
   * There is no perpetual market for these, which is a real answer and a different one.
   */
  if (isStock(symbol)) return null;
  if (!COINGECKO_IDS[upper]) return null;

  /*
   * Bounded, because the alternative is a screen that spins for a minute.
   *
   * This called `priceOf(upper)` with no deadline — the only caller that did; the other six pass
   * 3s to 10s. On a cold cache the underlying request is a fetch to a public, rate-limited price
   * tier, and the first `/perp/BTC` after a deploy took **sixty seconds and never answered**,
   * while `/perp/ETH` served from the warmed cache in half a second. The project's own screen
   * sweep caught it as a failed request.
   *
   * A timeout is also not the same answer as "no feed", and returning `null` for both made the
   * route reply "No spot feed for this contract" about an asset it prices correctly a moment
   * later. `PriceTooSlow` keeps them apart so the route can say which happened.
   */
  const px = await priceOf(upper, PRICE_DEADLINE_MS).catch(() => {
    throw new PriceTooSlow(upper);
  });
  if (!(px > 0)) return null;

  return {
    symbol: upper,
    markPx: px,
    // With no venue of our own, mark and index are the same number. Reporting a spread we cannot
    // observe would be inventing the one figure a perp trader would act on.
    oraclePx: px,
    markVsIndex: 0,
    openInterestUsd: null,
    dayVolumeUsd: null,
    fundingRate: null,
    maxLeverage: 10,
    nextFundingSeconds: Math.max(0, Math.round((at - Date.now()) / 1000)),
    nextFundingAt: at,
    feed: 'live',
    unavailable: ['openInterestUsd', 'dayVolumeUsd', 'fundingRate'],
  };
}
