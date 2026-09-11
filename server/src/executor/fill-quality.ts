/**
 * How far each fill landed from the market price at the moment the run decided to trade.
 *
 * WHAT THE REFERENCE IS — stated first, because it was described wrongly when this shipped.
 * `quoted_units` is the `units` value `run.ts` computes before sending: `usd / priceOf(symbol)`,
 * the amount of the asset the LIVE MARKET PRICE implied at decision time. It is not any venue's
 * own quote. That makes this implementation shortfall against the arrival price — the standard,
 * venue-neutral measure of execution — and it is what makes venues comparable at all: measuring
 * the aggregator against its own quote would be the aggregator grading itself.
 *
 * The trail already names the venue that settled every trade. That is a label. This is the claim:
 * how many basis points of the market each venue actually delivered, over real fills.
 *
 * Reported signed, from the taker's point of view: **positive means the fill bought more of the
 * asset than the market price implied**. Negative is the cost. "30 bps of slippage" and "+30 bps"
 * are opposite facts about the same trade, so the sign is always shown.
 *
 * WHAT THIS NUMBER IS NOT, ON A FORK
 *
 * The market price comes from a live feed; a fork is pinned at a block, so its pools have drifted
 * from the market the price describes. On `base-fork` the figure therefore mixes venue quality
 * with however far the fork has moved — and with the pricing of whichever maker happened to ship a
 * book. The first measurements came out at **SwapVM +71 bps** and **Aqua −308 bps**, and neither
 * is a ranking of the venues. `basis` says which situation produced the figure so a reader is never
 * left to guess; on Base mainnet, where price and fill describe the same market, it means what it
 * says.
 */
import { query } from '../db/index.js';
import { CHAIN_KEY } from '../evm/chains.js';

export type VenueQuality = {
  venue: string;
  /** Fills with BOTH a quote and a measured delta. Rows predating migration 012 are excluded. */
  fills: number;
  /** Mean signed difference from the arrival price, in basis points. Positive = more asset than the price implied. */
  meanBps: number;
  /** The worst single fill, which a mean hides and a user cares about. */
  worstBps: number;
  bestBps: number;
};

export type FillQuality = {
  venues: VenueQuality[];
  /** Fills that could be measured at all — the denominator behind every figure above. */
  measured: number;
  /** Fills recorded before the quote was kept. Stated rather than quietly dropped. */
  unmeasurable: number;
  /**
   * Whether the quote and the fill describe the same chain.
   *
   * `same-chain` — the market price and the fill describe the same chain. The figure is execution quality.
   * `forked` — the price is the live market and the fill executed against a pinned block, so the
   * figure also carries however far the fork has drifted. Not a smaller number; a different one.
   */
  basis: 'same-chain' | 'forked';
};

export async function fillQuality(): Promise<FillQuality> {
  /*
   * Only rows where the comparison is real.
   *
   * `quoted_units > 0` excludes both the pre-migration rows and any fill whose quote was never
   * established — dividing by that would produce an infinity and a very confident chart.
   */
  const rows = await query<{ venue: string | null; quoted: string; filled: string }>(
    `SELECT venue, quoted_units::text AS quoted, units::text AS filled
       FROM strategy_runs
      WHERE status = 'filled'
        AND quoted_units IS NOT NULL AND quoted_units > 0
        AND units IS NOT NULL AND units > 0`,
    [],
  );

  const unmeasurableRow = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM strategy_runs
      WHERE status = 'filled' AND (quoted_units IS NULL OR quoted_units <= 0)`,
    [],
  );

  /*
   * A supply is not a fill against a market.
   *
   * 100 USDC into Aave is 100 aUSDC by construction, so its "distance from the arrival price" is
   * zero every time — a figure that says nothing about execution and drags whichever venue it is
   * filed under toward zero. It was filed under `1inch`. It is excluded, not re-labelled into the
   * table, because there is nothing about it to measure.
   */
  const trades = rows.filter((r) => r.venue !== 'aave');

  const byVenue = new Map<string, number[]>();
  for (const r of trades) {
    const quoted = Number(r.quoted);
    const filled = Number(r.filled);
    if (!Number.isFinite(quoted) || !Number.isFinite(filled) || quoted <= 0) continue;
    const bps = ((filled - quoted) / quoted) * 10_000;
    const key = r.venue ?? 'unrecorded';
    const list = byVenue.get(key) ?? [];
    list.push(bps);
    byVenue.set(key, list);
  }

  const venues: VenueQuality[] = [...byVenue.entries()]
    .map(([venue, bpsList]) => ({
      venue,
      fills: bpsList.length,
      meanBps: Math.round((bpsList.reduce((a, b) => a + b, 0) / bpsList.length) * 10) / 10,
      worstBps: Math.round(Math.min(...bpsList) * 10) / 10,
      bestBps: Math.round(Math.max(...bpsList) * 10) / 10,
    }))
    // Most fills first: a venue with one lucky fill should not lead a table about consistency.
    .sort((a, b) => b.fills - a.fills);

  return {
    venues,
    measured: venues.reduce((n, v) => n + v.fills, 0),
    unmeasurable: Number(unmeasurableRow[0]?.n ?? 0),
    basis: CHAIN_KEY === 'base' ? 'same-chain' : 'forked',
  };
}
