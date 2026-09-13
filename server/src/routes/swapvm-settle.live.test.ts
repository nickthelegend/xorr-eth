/**
 * LIVE — an app grant reaches SwapVM, and a strategy run settles through it (PLAN.md 3.1).
 *
 * The venues a grant names come from the executor — `/delegation/params`, which the app signs from and
 * `fork-grant.ts` grants from — and the SwapVM book was not among them, so no grant but the one
 * `live-swapvm.ts` wrote for itself could ever let a SwapVM fill through `spend()`. On the fork, under the grant
 * `npm run rebuild:fork` wrote from that list: what the executor offers to grant is what the chain allows, and a
 * $400 WETH buy — past the size the Aqua book's price band will quote, inside what the SwapVM program fills —
 * settles through `swapvm`. The contract enforces the venue list, so that fill is itself the proof the grant
 * names the SwapVM book. The WETH is sold back.
 *
 * Run: EXPO_PUBLIC_API_URL=<fork executor> LIVE=1 npx vitest run swapvm-settle.live
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8788';
const TOKEN_SCRIPT = fileURLToPath(new URL('../e2e-token.ts', import.meta.url));
const OWNER_EMAIL = process.env.E2E_PRIVY_EMAIL ?? 'test-8958@privy.io';
const USD = 400;

const health = (await (await fetch(`${BASE}/health`)).json().catch(() => ({}))) as { chain?: string };
const FORK = health.chain === 'base-fork';

let token = '';
async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}

const addresses = (xs: unknown) => (Array.isArray(xs) ? xs.map((x) => String(x).toLowerCase()).sort() : []);
let strategyId = '';

describe.skipIf(!FORK)(`SwapVM under the app's grant (runs on the fork; this is ${health.chain})`, () => {
  beforeAll(() => {
    token = execFileSync('npx', ['tsx', TOKEN_SCRIPT, OWNER_EMAIL], { encoding: 'utf8' }).trim();
  }, 60_000);

  afterAll(async () => {
    if (token && strategyId) await call('DELETE', `/strategies/${strategyId}`);
  }, 60_000);

  it('offers exactly the venues the chain allows', async () => {
    const offered = await call('GET', '/delegation/params');
    const granted = await call('GET', '/delegation');
    expect(offered.status, JSON.stringify(offered.body)).toBe(200);
    expect(granted.status, JSON.stringify(granted.body)).toBe(200);
    expect(addresses(offered.body?.venues).length).toBeGreaterThan(0);
    expect(addresses(granted.body?.venueAllowlist)).toEqual(addresses(offered.body?.venues));
  }, 60_000);

  it(`settles a $${USD} buy through the SwapVM program`, async () => {
    // Why this size: the Aqua book's band refuses it and the program can fill it — asked, not assumed.
    const compared = await call('GET', `/route/compare?in=USDC&out=WETH&amount=${USD}`);
    const quotes = (compared.body?.quotes ?? []) as { venue: string; served: boolean }[];
    expect(quotes.find((q) => q.venue === 'aqua')?.served, JSON.stringify(compared.body)).toBe(false);
    expect(quotes.find((q) => q.venue === 'swapvm')?.served, JSON.stringify(compared.body)).toBe(true);

    const created = await call('POST', '/strategies', {
      kind: 'dca',
      state: 'paused',
      label: `SwapVM settlement ${randomUUID().slice(0, 8)}`,
      symbol: 'WETH',
      cadence: 'weekly',
      dailyAllocationUsd: USD,
      params: { usd: USD },
    });
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    strategyId = String(created.body?.id);

    const run = await call('POST', `/strategies/${strategyId}/run`);
    expect(run.body, JSON.stringify(run.body)).toMatchObject({ status: 'filled' });
    expect(String(run.body?.signature)).toMatch(/^0x[0-9a-fA-F]{64}$/);

    const runs = (await call('GET', '/runs?limit=10')).body as unknown as { signature: string; venue: string; side: string }[];
    const filled = runs.find((r) => r.signature === run.body?.signature);
    expect(filled, 'the fill is listed in /runs').toBeDefined();
    expect(filled?.venue).toBe('swapvm');
    expect(filled?.side).toBe('buy');
  }, 300_000);

  it('sells the WETH back', async () => {
    const sold = await call('POST', '/positions/close', { symbol: 'WETH', fraction: 1 });
    expect(sold.status, JSON.stringify(sold.body)).toBe(200);
  }, 300_000);
});
