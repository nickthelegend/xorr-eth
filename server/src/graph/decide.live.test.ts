/**
 * LIVE — the agent decides from the deployed subgraph. No mocked or local data.
 * Run: LIVE=1 npx vitest run src/graph/decide.live.test.ts
 */
import { describe, expect, it } from 'vitest';
import { indexesThisDeployment } from './client.js';

/**
 * These assertions are about the INDEXED deployment.
 *
 * The subgraph describes one contract on one network. Run the executor against a Base mainnet fork
 * and `decide()` correctly declines to read permission from an index about a different contract —
 * so the substantive tests below have nothing to measure. Skipping with the reason stated beats
 * either failing (which would be wrong) or asserting nothing (which would be worse).
 */
const onIndexedDeployment = indexesThisDeployment();
const whenIndexed = onIndexedDeployment ? it : it.skip;
import { decide } from './decide.js';
import { dailySpendFor, health, policyFor, spendsFor, unitsToUsd } from './client.js';

// The owner with a live policy on Base Sepolia.
const OWNER = '0x364d7Bbc139541e0e37450D527ae154B5C292581';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

describe('The Graph is load-bearing for the agent', () => {
  it('the indexer is healthy', async () => {
    const h = await health();
    expect(h.healthy).toBe(true);
    expect(h.block).toBeGreaterThan(46_000_000);
  }, 60_000);

  whenIndexed('the agent reads the live policy from indexed data', async () => {
    const p = await policyFor(OWNER);
    expect(p).not.toBeNull();
    expect(unitsToUsd(p!.dailyCap)).toBe(400);
    expect(p!.revoked).toBe(false);
  }, 60_000);

  whenIndexed('DECIDES to act, sized from what the chain says is left today', async () => {
    const d = await decide({ owner: OWNER, wantUsd: 100, token: USDC });
    expect(d.act).toBe(true);
    if (!d.act) return;
    // Never more than a quarter of the remaining cap in one trade.
    expect(d.sizeUsd).toBeLessThanOrEqual(d.observedRemainingUsd * 0.25 + 1e-9);
    expect(d.sizeUsd).toBeGreaterThan(0);
    expect(d.rationale).toContain('on-chain');
  }, 60_000);

  whenIndexed('sizes DOWN when asked for more than the remaining cap allows', async () => {
    const d = await decide({ owner: OWNER, wantUsd: 1_000_000, token: USDC });
    if (!d.act) return; // a legitimate refusal is also a correct outcome
    expect(d.sizeUsd).toBeLessThan(1_000_000);
    expect(d.sizeUsd).toBeLessThanOrEqual(d.observedRemainingUsd);
  }, 60_000);

  whenIndexed('refuses for an address with no policy — it does not invent permission', async () => {
    const d = await decide({
      owner: '0x000000000000000000000000000000000000dEaD',
      wantUsd: 100,
      token: USDC,
    });
    expect(d.act).toBe(false);
    if (d.act) return;
    expect(d.reason).toBe('no_policy_onchain');
  }, 60_000);

  whenIndexed('the settled spends it reasons over are real, with verifiable hashes', async () => {
    const spends = await spendsFor(OWNER);
    expect(spends.length).toBeGreaterThan(0);
    for (const s of spends) expect(s.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    const daily = await dailySpendFor(OWNER);
    expect(daily.length).toBeGreaterThan(0);
  }, 60_000);
});

describe('the route is chosen by joining the two indexes', () => {
  it('declines to read permission from an index about a different contract', async () => {
    // The guard itself, always checked: on a fork this is the whole answer, and on the indexed
    // deployment it must NOT fire.
    const d = await decide({ owner: OWNER, wantUsd: 25, token: USDC });
    if (!onIndexedDeployment) {
      expect(d.act).toBe(false);
      if (!d.act) expect(d.reason).toBe('index_is_for_another_deployment');
      return;
    }
    if (!d.act) expect(d.reason).not.toBe('index_is_for_another_deployment');
  }, 30_000);

  whenIndexed('falls to the aggregator, and says why, when no venue index is configured', async () => {
    // Composition has to degrade legibly. Aqua is Base-mainnet-only, so a Sepolia deployment has
    // no venue index — the decision still happens, and the rationale says a book was never
    // considered rather than implying one was looked at and rejected.
    const d = await decide({ owner: OWNER, wantUsd: 25, token: USDC });
    expect(d.act, 'the live policy should still permit a small trade').toBe(true);
    if (!d.act) return;
    expect(d.route.venue).toBe('1inch');
    expect(d.route.why).toMatch(/index|book/i);
    // The reason must reach the user-facing rationale, not be swallowed.
    expect(d.rationale).toContain(d.route.why);
  }, 30_000);
});
