/**
 * The arithmetic, and the rows it must refuse to include.
 *
 * A fill-quality number computed over rows with no quote is not a measurement, it is a shape; the
 * pre-migration rows have no quote to recover and inventing one would put a fabricated figure into
 * the only table that says how well the routing works.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

let rows: { venue: string | null; quoted: string; filled: string }[] = [];
let unmeasurable = 0;

vi.mock('../evm/chains.js', () => ({ CHAIN_KEY: 'base-fork' }));
vi.mock('../db/index.js', () => ({
  query: async (sql: string) =>
    /count\(\*\)/.test(sql) ? [{ n: String(unmeasurable) }] : rows,
  one: async () => undefined,
  tx: async (fn: (c: unknown) => unknown) => fn({}),
}));

const { fillQuality } = await import('./fill-quality.js');

beforeEach(() => {
  rows = [];
  unmeasurable = 0;
});

describe('how close each venue came to its quote', () => {
  it('reports a fill that beat the quote as POSITIVE basis points', async () => {
    rows = [{ venue: 'aqua', quoted: '100', filled: '100.5' }];
    const q = await fillQuality();
    expect(q.venues[0]!.meanBps).toBe(50);
  });

  it('reports slippage as negative, because the sign is the fact', async () => {
    rows = [{ venue: '1inch', quoted: '100', filled: '99.7' }];
    const q = await fillQuality();
    expect(q.venues[0]!.meanBps).toBe(-30);
  });

  it('keeps the worst single fill, which a mean hides', async () => {
    rows = [
      { venue: 'aqua', quoted: '100', filled: '101' },
      { venue: 'aqua', quoted: '100', filled: '99' },
    ];
    const q = await fillQuality();
    expect(q.venues[0]!.meanBps).toBe(0);
    expect(q.venues[0]!.worstBps).toBe(-100);
    expect(q.venues[0]!.bestBps).toBe(100);
  });

  it('separates venues rather than averaging them together', async () => {
    rows = [
      { venue: 'aqua', quoted: '100', filled: '101' },
      { venue: '1inch', quoted: '100', filled: '99' },
    ];
    const q = await fillQuality();
    expect(q.venues.map((v) => v.venue).sort()).toEqual(['1inch', 'aqua']);
  });

  it('orders by fill count, so one lucky fill does not lead the table', async () => {
    rows = [
      { venue: 'aqua', quoted: '100', filled: '105' },
      { venue: '1inch', quoted: '100', filled: '100' },
      { venue: '1inch', quoted: '100', filled: '100' },
    ];
    const q = await fillQuality();
    expect(q.venues[0]!.venue).toBe('1inch');
  });

  it('refuses a row whose quote is zero rather than dividing by it', async () => {
    rows = [
      { venue: 'aqua', quoted: '0', filled: '5' },
      { venue: 'aqua', quoted: '100', filled: '100' },
    ];
    const q = await fillQuality();
    expect(q.venues[0]!.fills).toBe(1);
    expect(Number.isFinite(q.venues[0]!.meanBps)).toBe(true);
  });

  /*
   * The first Earn deposit on the rebuilt fork was written down as a 1inch fill, and the table read
   * "1inch: 1 fill, 0 bps" for a trade the aggregator never saw. A supply is 1:1 by construction;
   * there is no execution in it to grade.
   */
  it('leaves a supply to Aave out of the table instead of scoring it as a perfect fill', async () => {
    rows = [
      { venue: 'aave', quoted: '100', filled: '100' },
      { venue: 'swapvm', quoted: '100', filled: '100.7' },
    ];
    const q = await fillQuality();
    expect(q.venues.map((v) => v.venue)).toEqual(['swapvm']);
    expect(q.measured).toBe(1);
  });

  it('states how many fills could not be measured instead of dropping them silently', async () => {
    rows = [{ venue: 'aqua', quoted: '100', filled: '100' }];
    unmeasurable = 41;
    const q = await fillQuality();
    expect(q.measured).toBe(1);
    expect(q.unmeasurable).toBe(41);
  });

  /*
   * On a fork the reference quote prices live mainnet while the fill executes against a pinned
   * block, so the figure carries drift as well as venue quality. Saying which situation produced
   * it is the difference between a measurement and a number.
   */
  it('says whether the quote and the fill describe the same chain', async () => {
    rows = [{ venue: 'swapvm', quoted: '100', filled: '100' }];
    expect((await fillQuality()).basis).toBe('forked');
  });
});
