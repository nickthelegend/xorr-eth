/**
 * How close each venue's fill came to the quote it was chosen on.
 *
 * The trail already names the venue that settled every trade. That is a label, and a label is not
 * a claim about routing — "Aqua filled this" says nothing about whether Aqua was the right choice.
 * What makes it a claim is the distance between what the router promised and what the chain
 * delivered, measured per venue over real fills.
 *
 * Both halves already existed and were never compared. `chooseSettlement` knows the venue exactly,
 * and `measuredDelta` reads the owner's balance either side of the transaction so the units written
 * are the chain's rather than the router's. The quote was overwritten by the measurement before the
 * row was stored, so the comparison was lost at the moment it became possible. Migration 012 keeps
 * both.
 *
 * Reported in basis points, signed, from the taker's point of view: **positive means the fill
 * beat the quote**. Slippage is the negative side, and the sign is worth being explicit about
 * because "4 bps of slippage" and "+4 bps" are opposite facts about the same trade.
 *
 * WHAT THIS NUMBER IS NOT, ON A FORK
 *
 * The reference quote comes from 1inch, which prices **live Base mainnet**. A fork is pinned at a
 * block, so its pools have drifted from the chain the quote describes. On `base-fork` the figure
 * therefore mixes two things — how well the venue filled, and how far the fork has moved since it
 * was taken — and the first real measurement here came out at **+71 bps**, which is far more drift
 * than venue skill.
 *
 * That is stated rather than corrected, because there is no honest correction: the drift is not
 * separable from this measurement without a second price source for the fork's own block, and
 * inventing one would put a derived number where a measured one belongs. On Base mainnet, where
 * the quote and the fill describe the same chain, the figure means what it says. `basis` carries
 * which of the two situations produced it so a reader is never left to guess.
 */
import { query } from '../db/index.js';
import { CHAIN_KEY } from '../evm/chains.js';

export type VenueQuality = {
  venue: string;
  /** Fills with BOTH a quote and a measured delta. Rows predating migration 012 are excluded. */
  fills: number;
  /** Mean signed difference, in basis points. Positive = the fill beat the quote. */
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
   * `same-chain` — the reference quote and the fill are both live Base. The figure is venue quality.
   * `forked` — the quote prices live mainnet and the fill executed against a pinned block, so the
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

  const byVenue = new Map<string, number[]>();
  for (const r of rows) {
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
    measured: rows.length,
    unmeasurable: Number(unmeasurableRow[0]?.n ?? 0),
    basis: CHAIN_KEY === 'base' ? 'same-chain' : 'forked',
  };
}
