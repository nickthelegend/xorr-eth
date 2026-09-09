/**
 * LIVE — every tokenized equity we offer must be real and routable on Base right now.
 *
 * A dead symbol here is worse than a missing one: the app would show a Buy button that quotes,
 * takes the tap, and then fails at signing time. Run with: npm run test:live
 */
import { describe, expect, it } from 'vitest';
import { createPublicClient, http, erc20Abi } from 'viem';
import { base } from 'viem/chains';
import { STOCKS } from './stocks.js';
import { quote } from './oneinch.js';

/**
 * Deliberately real Base, not a fork: several of these tokens have no EVM bytecode at all (their
 * account code is the single byte 0xef and the node implements them natively), so a fork cannot
 * read them. The public RPC rate-limits, hence the spacing below.
 */
const client = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') });

/**
 * Retry, but ONLY when the RPC said it was rate limiting.
 *
 * `mainnet.base.org` is the free public endpoint and throttles after a short burst —
 * `base-readiness.ts` documents the same behaviour and spaces its reads for it. It answers a
 * throttle as a JSON-RPC error inside a 200 whose detail reads `over rate limit`, which viem's
 * transport does not treat as retryable, so the multicall below failed and the suite reported real
 * deployed tokens as missing.
 *
 * Narrow on purpose. A blanket retry would make a genuinely dead token take four times as long to
 * report and would be the kind of "make the red go away" change this repo argues against; matching
 * the throttle's own words means every other failure still fails on the first attempt.
 */
async function pastTheThrottle<T>(work: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await work();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      const throttled = /over rate limit|429|too many requests/i.test(m);
      if (!throttled || attempt === 4) throw e;
      await new Promise((r) => setTimeout(r, 1_500 * (attempt + 1)));
    }
  }
}

describe('tokenized equities on Base', () => {
  it('every address is a real token with the symbol and decimals we claim', async () => {
    // One multicall rather than 24 reads: the public Base RPC rate-limits well below that.
    const list = Object.values(STOCKS);
    const results = await pastTheThrottle(() =>
      client.multicall({
        allowFailure: false,
        contracts: list.flatMap((s) => [
          { address: s.address, abi: erc20Abi, functionName: 'symbol' } as const,
          { address: s.address, abi: erc20Abi, functionName: 'decimals' } as const,
          { address: s.address, abi: erc20Abi, functionName: 'totalSupply' } as const,
        ]),
      }),
    );

    list.forEach((s, i) => {
      const [symbol, decimals, supply] = results.slice(i * 3, i * 3 + 3) as [string, number, bigint];
      expect(symbol, `${s.symbol} address points at ${symbol}`).toBe(s.symbol);
      expect(decimals, `${s.symbol} decimals`).toBe(s.decimals);
      expect(supply, `${s.symbol} has no supply`).toBeGreaterThan(0n);
    });
  }, 120_000);

  it('1inch routes USDC into every one of them at a plausible price', async () => {
    for (const s of Object.values(STOCKS)) {
      const q = await quote({ inSymbol: 'USDC', outSymbol: s.symbol, amount: 100 });
      expect(q.outAmount, `${s.symbol} has no route`).toBeGreaterThan(0);
      // $100 of a listed US equity is a fraction of a share to a few shares. Anything outside
      // that says the decimals are wrong, not that the market moved.
      const impliedPrice = 100 / q.outAmount;
      expect(impliedPrice, `${s.symbol} implied $${impliedPrice}/share`).toBeGreaterThan(5);
      expect(impliedPrice, `${s.symbol} implied $${impliedPrice}/share`).toBeLessThan(5_000);
      expect(q.venues.length, `${s.symbol} route has no venues`).toBeGreaterThan(0);
    }
  }, 180_000);
});
