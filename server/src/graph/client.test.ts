/**
 * A subgraph that never answers (PLAN.md 2.13).
 *
 * The query had no deadline, so a gateway that accepted the connection and then went quiet held the run
 * that asked open indefinitely. These drive the real client with `fetch` replaced.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const { health, setSubgraphTimeoutForTests, SubgraphUnavailable } = await import('./client.js');

afterEach(() => {
  vi.unstubAllGlobals();
  setSubgraphTimeoutForTests(5_000);
});

describe('a subgraph query', () => {
  it('gives up at its deadline with the same error as any unreachable index', async () => {
    setSubgraphTimeoutForTests(50);
    // Accepts the request and never answers — except to the abort signal, as a real fetch does.
    vi.stubGlobal('fetch', (_url: string, init: { signal: AbortSignal }) =>
      new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason))),
    );
    const started = Date.now();
    const err = await health().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SubgraphUnavailable);
    expect(String((err as Error).message)).toContain('no answer in 50ms');
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('is deadlined at 5 seconds unless told otherwise', async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', async (_url: string, init: { signal: AbortSignal }) => {
      signal = init.signal;
      return new Response(JSON.stringify({ data: { _meta: { block: { number: 46748446 }, hasIndexingErrors: false } } }));
    });
    expect(await health()).toEqual({ block: 46748446, healthy: true });
    expect(signal).toBeDefined();
    expect(signal!.aborted).toBe(false);
  });

  it('a network failure is still an unreachable index, not a crash', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed');
    });
    await expect(health()).rejects.toThrow(SubgraphUnavailable);
  });
});
