/**
 * The venue index, and the join that makes two subgraphs better than one.
 *
 * `depthOf` and `bestBookFor` are what turn indexed Aqua flow into a routing decision. If these
 * are wrong the agent sends a trade to a book that cannot fill it, which is worse than not having
 * the index at all.
 */
import { describe, expect, it } from 'vitest';
import { depthOf, aquaIndexConfigured, type Book } from './aqua.js';

const book = (id: string, fills: number, balances: [string, string][]): Book => ({
  id,
  maker: '0xmaker',
  app: '0xapp',
  open: true,
  fillCount: fills,
  balances: balances.map(([token, amount]) => ({ token, amount })),
});

const WETH = '0x4200000000000000000000000000000000000006';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

describe('book depth from indexed flow', () => {
  it('reads the balance for a token the book holds', () => {
    expect(depthOf(book('a', 3, [[WETH, '5000000000000000000']]), WETH)).toBe(
      5_000000000000000000n,
    );
  });

  it('is zero for a token the book has never held — not undefined, not a throw', () => {
    expect(depthOf(book('a', 3, [[WETH, '1']]), USDC)).toBe(0n);
  });

  it('matches case-insensitively, because the subgraph lowercases addresses', () => {
    expect(depthOf(book('a', 1, [[WETH.toLowerCase(), '7']]), WETH.toUpperCase())).toBe(7n);
  });

  it('a docked book that pushed everything back reads as empty', () => {
    expect(depthOf(book('a', 9, [[WETH, '0']]), WETH)).toBe(0n);
  });
});

describe('configuration is explicit', () => {
  it('says plainly whether a venue index exists for this deployment', () => {
    // Aqua is Base mainnet only, so a Sepolia deployment legitimately has none. The agent must be
    // able to tell "no book" from "no index" — one is a routing fact, the other is an outage.
    expect(typeof aquaIndexConfigured()).toBe('boolean');
  });
});
