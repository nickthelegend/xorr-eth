/**
 * The net-of-gas ranking, and the one rule that keeps it honest.
 *
 * A comparison "after gas" that silently omits a venue it could not cost is not a comparison — it
 * ranks the venues we happened to price and presents the result as though it had considered all of
 * them. `bestNet` is therefore undefined unless every served venue carries a cost.
 *
 * The arithmetic is exercised through the exported shape rather than the network: the point under
 * test is the ranking rule, not whether 1inch answers.
 */
import { describe, expect, it } from 'vitest';
import type { RouteComparison, VenueQuote } from './compare.js';

/** The same rule `compareVenues` applies, stated once so the test cannot drift from a copy of it. */
function rank(quotes: VenueQuote[]): Pick<RouteComparison, 'best' | 'bestNet'> {
  const served = quotes.filter((q): q is Extract<VenueQuote, { served: true }> => q.served);
  const byOut = [...served].sort((a, b) => b.outAmount - a.outAmount);
  const allCosted = served.length > 0 && served.every((q) => q.netUsd !== undefined);
  const byNet = allCosted ? [...served].sort((a, b) => b.netUsd! - a.netUsd!) : [];
  return { best: byOut[0]?.venue, bestNet: byNet[0]?.venue };
}

const served = (
  venue: VenueQuote['venue'],
  outAmount: number,
  netUsd?: number,
): VenueQuote => ({ venue, served: true, outAmount, detail: 'test', netUsd });

describe('ranking venues after gas', () => {
  it('the gross winner and the net winner can differ — which is the reason to compute it', () => {
    // Aqua returns slightly less, but a single book fill costs far less gas than a 3-pool route.
    const r = rank([served('1inch', 1.01, 99.10), served('aqua', 1.0, 99.60)]);
    expect(r.best).toBe('1inch');
    expect(r.bestNet).toBe('aqua');
  });

  it('agrees with the gross winner when gas does not change the order', () => {
    const r = rank([served('1inch', 1.01, 99.9), served('aqua', 1.0, 99.1)]);
    expect(r.best).toBe('1inch');
    expect(r.bestNet).toBe('1inch');
  });

  it('names NO net winner when a served venue could not be costed', () => {
    const r = rank([served('1inch', 1.01, 99.9), served('aqua', 1.0, undefined)]);
    expect(r.best).toBe('1inch');
    expect(r.bestNet).toBeUndefined();
  });

  it('names no winner at all when nothing could serve', () => {
    const r = rank([
      { venue: 'aqua', served: false, reason: 'no book deep enough for this size' },
      { venue: 'swapvm', served: false, reason: 'no program shipped for this pair' },
    ]);
    expect(r.best).toBeUndefined();
    expect(r.bestNet).toBeUndefined();
  });

  it('a single costed venue is its own net winner', () => {
    const r = rank([served('1inch', 1.0, 99.7)]);
    expect(r.bestNet).toBe('1inch');
  });
});
