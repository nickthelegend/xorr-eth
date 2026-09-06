/**
 * What each tier decides to do.
 *
 * These are the branches that used not to exist: every strategy executed as a recurring buy
 * whatever it said it was. The properties below are the ones that make each tier trustworthy —
 * a rebalance trades only the drift, and a stop can only ever close.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * A holding with a raw balance that actually matches its unit count.
 *
 * `Holding.raw` exists because a float cannot represent a wei count, and closing a whole position
 * has to use the chain's own number. A fixture that made one up would defeat the point, so this
 * derives it the same way `holdings()` does — from the units and the token's decimals.
 */
function holding(symbol: string, units: number, usd: number, decimals = 18) {
  return { symbol, units, usd, raw: BigInt(Math.round(units * 10 ** decimals)) };
}


vi.mock('../../evm/balances.js', () => ({
  cashUsd: vi.fn(),
  holdings: vi.fn(),
}));
vi.mock('../../market/prices.js', () => ({ priceOf: vi.fn() }));

const { cashUsd, holdings } = await import('../../evm/balances.js');
const { priceOf } = await import('../../market/prices.js');
const { planRebalance, planExitRules, planDca } = await import('./index.js');

const OWNER = '0x0000000000000000000000000000000000000001' as const;

beforeEach(() => {
  vi.mocked(priceOf).mockResolvedValue(2_500);
});

describe('tier 1 — recurring buy', () => {
  it('buys exactly the budget, and picks nothing', () => {
    const i = planDca({ owner: OWNER, budgetUsd: 250, params: {}, symbol: 'WETH' });
    expect(i).toMatchObject({ inSymbol: 'USDC', outSymbol: 'WETH', amountIn: 250, usd: 250 });
  });

  it('maps ETH to WETH, because that is what settles', () => {
    expect(planDca({ owner: OWNER, budgetUsd: 100, params: {}, symbol: 'ETH' }).outSymbol).toBe(
      'WETH',
    );
  });
});

describe('tier 2 — rebalance', () => {
  it('does nothing when the portfolio is already on target', async () => {
    vi.mocked(cashUsd).mockResolvedValue(400);
    vi.mocked(holdings).mockResolvedValue([holding('WETH', 0.24, 600)]);
    // 600 of 1000 is exactly the 60% target.
    const i = await planRebalance({
      owner: OWNER,
      budgetUsd: 500,
      params: { targets: { WETH: 60 } },
      symbol: 'WETH',
    });
    expect(i).toBeNull();
  });

  it('buys the sleeve that is under weight', async () => {
    vi.mocked(cashUsd).mockResolvedValue(1_000);
    vi.mocked(holdings).mockResolvedValue([]);
    const i = await planRebalance({
      owner: OWNER,
      budgetUsd: 1_000,
      params: { targets: { WETH: 60 } },
      symbol: 'WETH',
    });
    expect(i).toMatchObject({ inSymbol: 'USDC', outSymbol: 'WETH' });
    expect(i!.usd).toBeCloseTo(600, 0);
    expect(i!.because).toMatch(/under its target/);
  });

  it('SELLS the sleeve that is over weight, sized in coins not dollars', async () => {
    vi.mocked(cashUsd).mockResolvedValue(0);
    vi.mocked(holdings).mockResolvedValue([holding('WETH', 0.4, 1_000)]);
    const i = await planRebalance({
      owner: OWNER,
      budgetUsd: 1_000,
      params: { targets: { WETH: 60 } },
      symbol: 'WETH',
    });
    expect(i).toMatchObject({ inSymbol: 'WETH', outSymbol: 'USDC' });
    // 400 dollars over, at 2500/coin, is 0.16 coins. Dollars here would have been a 400e18 order.
    expect(i!.amountIn).toBeCloseTo(0.16, 4);
    expect(i!.usd).toBeCloseTo(400, 0);
  });

  it('never trades below the point where gas costs more than the drift', async () => {
    vi.mocked(cashUsd).mockResolvedValue(1_000);
    vi.mocked(holdings).mockResolvedValue([holding('WETH', 0.6, 1_499)]);
    const i = await planRebalance({
      owner: OWNER,
      budgetUsd: 1_000,
      params: { targets: { WETH: 60 } },
      symbol: 'WETH',
    });
    expect(i).toBeNull();
  });

  it('is capped by what the run is allowed to spend', async () => {
    vi.mocked(cashUsd).mockResolvedValue(10_000);
    vi.mocked(holdings).mockResolvedValue([]);
    const i = await planRebalance({
      owner: OWNER,
      budgetUsd: 250,
      params: { targets: { WETH: 60 } },
      symbol: 'WETH',
    });
    expect(i!.usd).toBe(250);
  });
});

describe('tier 3 — take profit and stop loss', () => {
  const held = [holding('WETH', 0.4, 1_000)];

  it('does nothing while the price is between the bands', async () => {
    vi.mocked(holdings).mockResolvedValue(held);
    vi.mocked(priceOf).mockResolvedValue(2_500);
    const i = await planExitRules({
      owner: OWNER,
      budgetUsd: 0,
      params: { entryPrice: 2_400, takeProfitPct: 20, stopLossPct: 20 },
      symbol: 'WETH',
    });
    expect(i).toBeNull();
  });

  it('closes the whole position on a take profit', async () => {
    vi.mocked(holdings).mockResolvedValue(held);
    vi.mocked(priceOf).mockResolvedValue(3_000);
    const i = await planExitRules({
      owner: OWNER,
      budgetUsd: 0,
      params: { entryPrice: 2_400, takeProfitPct: 20 },
      symbol: 'WETH',
    });
    expect(i).toMatchObject({ inSymbol: 'WETH', outSymbol: 'USDC', amountIn: 0.4 });
    expect(i!.because).toMatch(/take profit/);
  });

  it('closes the whole position on a stop', async () => {
    vi.mocked(holdings).mockResolvedValue(held);
    vi.mocked(priceOf).mockResolvedValue(1_800);
    const i = await planExitRules({
      owner: OWNER,
      budgetUsd: 0,
      params: { entryPrice: 2_400, stopLossPct: 20 },
      symbol: 'WETH',
    });
    expect(i!.because).toMatch(/your stop/);
  });

  it('CANNOT open a position — there is no branch that buys', async () => {
    vi.mocked(holdings).mockResolvedValue([]);
    vi.mocked(priceOf).mockResolvedValue(3_000);
    const i = await planExitRules({
      owner: OWNER,
      budgetUsd: 1_000,
      params: { entryPrice: 2_400, takeProfitPct: 20 },
      symbol: 'WETH',
    });
    // Nothing held, so nothing to close. It must not decide to buy instead.
    expect(i).toBeNull();
  });

  it('does nothing without an entry price to measure against', async () => {
    vi.mocked(holdings).mockResolvedValue(held);
    const i = await planExitRules({
      owner: OWNER,
      budgetUsd: 0,
      params: { takeProfitPct: 20 },
      symbol: 'WETH',
    });
    expect(i).toBeNull();
  });
});
