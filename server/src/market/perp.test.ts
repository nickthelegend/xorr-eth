/**
 * A perp screen answers, or says why it cannot — it does not hang.
 *
 * `perpMetrics` was the one caller of `priceOf` that passed no deadline; the other six pass 3s to
 * 10s. On a cold cache that meant an unbounded wait on a public, rate-limited price tier, and the
 * first `/perp/BTC` after a deploy took sixty seconds and never answered while `/perp/ETH` served
 * from the warm cache in half a second.
 *
 * And a timeout is not the same answer as "no feed". Returning `null` for both made the route say
 * "No spot feed for this contract" about an asset it priced correctly moments later.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const priceOf = vi.fn();
vi.mock('./prices.js', () => ({ priceOf: (...a: unknown[]) => priceOf(...a) }));

const { perpMetrics, PriceTooSlow } = await import('./perp.js');

/*
 * Braces matter here. `beforeEach(() => priceOf.mockReset())` RETURNS the mock, and vitest treats
 * a function returned from a hook as a teardown callback — so it calls the mock after each test,
 * which invokes whatever implementation the test just installed. With a throwing implementation
 * that is an unhandled rejection, reported as a failure of the test that had already passed.
 */
beforeEach(() => {
  priceOf.mockReset();
});

describe('perpMetrics', () => {
  it('always bounds how long it will wait for a price', async () => {
    priceOf.mockResolvedValue(79_000);
    await perpMetrics('BTC');
    // The bug was a call with no second argument at all.
    const [, deadline] = priceOf.mock.calls[0] as [string, number | undefined];
    expect(typeof deadline).toBe('number');
    expect(deadline).toBeGreaterThan(0);
  });

  it('reports a slow feed as slow, not as a missing one', async () => {
    priceOf.mockImplementation(async () => {
      throw new Error('price deadline for BTC');
    });
    let caught: unknown;
    try {
      await perpMetrics('BTC');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(PriceTooSlow);
    // The route turns this into a 503 "warming" with a retry-after, not a 404 "no feed".
    expect((caught as Error).message).toContain('did not answer in time');
  });

  it('still returns null for a contract with genuinely no feed', async () => {
    // A tokenized equity has no perpetual market — a real answer, and a different one.
    expect(await perpMetrics('NVDAc')).toBeNull();
    expect(await perpMetrics('NOTASYMBOL')).toBeNull();
    // No price was even asked for, so a slow feed cannot be confused with this case.
    expect(priceOf).not.toHaveBeenCalled();
  });

  it('prices a real contract from the live feed', async () => {
    priceOf.mockResolvedValue(2_505.74);
    const m = await perpMetrics('WETH');
    expect(m?.markPx).toBe(2_505.74);
    // Mark and index are the same number because we run no venue — inventing a spread would be
    // inventing the one figure a perp trader would act on.
    expect(m?.oraclePx).toBe(2_505.74);
    expect(m?.markVsIndex).toBe(0);
    expect(m?.unavailable).toContain('fundingRate');
  });
});
