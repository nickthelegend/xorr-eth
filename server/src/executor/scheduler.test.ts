/**
 * The scheduler survives its strategies (PLAN.md 1.6).
 *
 * A tick awaited each run with no catch, so one strategy that threw ended the tick for every
 * strategy after it and skipped the alert and anchor sweeps. And nothing stopped a slow tick from
 * overlapping the next one.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/index.js', () => ({ query: vi.fn() }));
vi.mock('./run.js', () => ({ runStrategy: vi.fn() }));
vi.mock('../alerts/evaluate.js', () => ({ evaluateAlerts: vi.fn(async () => []) }));
vi.mock('../audit/anchor-sweep.js', () => ({ anchorSweep: vi.fn(async () => null) }));

const { query } = await import('../db/index.js');
const { runStrategy } = await import('./run.js');
const { evaluateAlerts } = await import('../alerts/evaluate.js');
const { tick, guardedTick } = await import('./scheduler.js');

const row = (id: string) => ({ id, label: `strategy ${id}` });
const quiet = () => {
  const spies = [vi.spyOn(console, 'error'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'log')];
  for (const s of spies) s.mockImplementation(() => {});
  return () => spies.forEach((s) => s.mockRestore());
};

beforeEach(() => {
  vi.mocked(query).mockReset();
  vi.mocked(runStrategy).mockReset();
  vi.mocked(evaluateAlerts).mockClear();
});

describe('a tick', () => {
  it('runs every due strategy when one of them throws, and still sweeps alerts', async () => {
    const restore = quiet();
    vi.mocked(query).mockResolvedValue([row('a'), row('b')] as never);
    vi.mocked(runStrategy)
      .mockRejectedValueOnce(new Error('rpc exploded'))
      .mockResolvedValueOnce({ status: 'filled', runId: 'r', signature: '0x1', units: 1, price: 1 });

    expect(await tick(new Date())).toBe(1);
    expect(runStrategy).toHaveBeenCalledTimes(2);
    expect(evaluateAlerts).toHaveBeenCalledTimes(1);
    restore();
  });
});

describe('the interval', () => {
  it('skips a tick while the previous one is still running instead of stacking them', async () => {
    const restore = quiet();
    let finish!: () => void;
    vi.mocked(query).mockResolvedValue([row('slow')] as never);
    vi.mocked(runStrategy).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ status: 'skipped', reason: 'nothing_to_do' });
        }),
    );

    const first = guardedTick(new Date());
    await vi.waitFor(() => expect(runStrategy).toHaveBeenCalledTimes(1));
    expect(await guardedTick(new Date())).toBe('skipped');

    finish();
    expect(await first).toBe(0);

    // Once the slow tick is done, the next one runs as normal.
    vi.mocked(runStrategy).mockResolvedValueOnce({ status: 'skipped', reason: 'nothing_to_do' });
    expect(await guardedTick(new Date())).toBe(0);
    expect(runStrategy).toHaveBeenCalledTimes(2);
    restore();
  });
});
