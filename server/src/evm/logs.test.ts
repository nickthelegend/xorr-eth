/**
 * The property that matters is that a refused window is RETRIED, never skipped.
 *
 * Skipping would lose whatever was shipped inside it and lose it silently, which is the exact
 * failure this module exists to end rather than relocate.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const getLogs = vi.fn();
vi.mock('./client.js', () => ({ publicClient: { getLogs: (a: unknown) => getLogs(a) } }));

process.env.LOG_WINDOW_BLOCKS = '1000';
const { getLogsPaged, isRangeRefusal } = await import('./logs.js');

const EVENT = { type: 'event', name: 'Shipped', inputs: [] } as const;
const ADDRESS = '0x00000000000000000000000000000000000000A1' as const;

beforeEach(() => {
  getLogs.mockReset();
});

describe('paging eth_getLogs', () => {
  it('splits a wide range into windows and returns every log', async () => {
    getLogs.mockImplementation(async ({ fromBlock }: { fromBlock: bigint }) => [
      { blockNumber: fromBlock },
    ]);
    const logs = await getLogsPaged({ address: ADDRESS, event: EVENT, fromBlock: 0n, toBlock: 2_999n });
    expect(getLogs).toHaveBeenCalledTimes(3);
    expect(logs).toHaveLength(3);
    // Contiguous, no gaps: 0–999, 1000–1999, 2000–2999.
    expect(logs.map((l) => (l as unknown as { blockNumber: bigint }).blockNumber)).toEqual([0n, 1000n, 2000n]);
  });

  it('reads the limit out of the refusal and retries the same window', async () => {
    let refused = false;
    getLogs.mockImplementation(async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) => {
      if (!refused && toBlock - fromBlock + 1n > 200n) {
        refused = true;
        throw new Error('-32614 eth_getLogs is limited to a 200 range');
      }
      return [{ blockNumber: fromBlock, span: toBlock - fromBlock + 1n }];
    });
    const logs = await getLogsPaged({ address: ADDRESS, event: EVENT, fromBlock: 0n, toBlock: 398n });
    // The refused window is re-asked at the provider's own number, starting from the SAME block.
    expect((logs[0] as unknown as { blockNumber: bigint }).blockNumber).toBe(0n);
    expect((logs[0] as unknown as { span: bigint }).span).toBe(200n);
  });

  it('halves the window when the refusal names no number, and still covers the range', async () => {
    const served: [bigint, bigint][] = [];
    getLogs.mockImplementation(async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) => {
      if (toBlock - fromBlock + 1n > 250n) throw new Error('query returned more than 10000 results');
      served.push([fromBlock, toBlock]);
      return [{ blockNumber: fromBlock }];
    });
    // 300 blocks against a 250-block ceiling the provider does not name.
    const logs = await getLogsPaged({ address: ADDRESS, event: EVENT, fromBlock: 0n, toBlock: 299n });
    expect(logs.length).toBeGreaterThan(1);
    // Every block is covered exactly once, with no gap where a shipped book could hide.
    expect(served[0]![0]).toBe(0n);
    expect(served[served.length - 1]![1]).toBe(299n);
    for (let i = 1; i < served.length; i += 1) {
      expect(served[i]![0], 'a gap between windows').toBe(served[i - 1]![1] + 1n);
    }
  });

  it('rethrows a failure that is not about the range', async () => {
    getLogs.mockRejectedValue(new Error('unknown event signature'));
    await expect(
      getLogsPaged({ address: ADDRESS, event: EVENT, fromBlock: 0n, toBlock: 10n }),
    ).rejects.toThrow('unknown event signature');
  });

  it('recognises the refusals these providers actually send', () => {
    expect(isRangeRefusal(new Error('eth_getLogs is limited to a 2,000 range'))).toBe(true);
    expect(isRangeRefusal(new Error('exceeds max block range'))).toBe(true);
    expect(isRangeRefusal(new Error('execution reverted'))).toBe(false);
  });
});
