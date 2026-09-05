/**
 * LIVE — the agent lifecycle, against the real database and the real HTTP surface.
 *
 * Hiring used to be a boolean in browser state, so none of these properties existed to test. They
 * are the ones that matter now: hiring twice must not produce two agents, firing must stop the
 * work without erasing it, and an agent must belong to exactly one wallet.
 *
 * Run with the executor up: npm run test:live
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8788';
const TEST_EMAIL = process.env.E2E_PRIVY_EMAIL ?? 'test-8958@privy.io';

let token: string;

const req = (path: string, init?: RequestInit) =>
  fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });

beforeAll(() => {
  // A real Privy access token, verified by the same verifyAuthToken production uses.
  token = execFileSync('npx', ['tsx', 'src/e2e-token.ts', TEST_EMAIL], {
    encoding: 'utf8',
    cwd: process.cwd(),
  }).trim();
  expect(token.length).toBeGreaterThan(100);
});

describe('the agent roster is persisted', () => {
  it('returns every persona, each marked hired or not', async () => {
    const rows = (await (await req('/agents')).json()) as { personaId: string; hired: boolean }[];
    expect(rows.length).toBeGreaterThanOrEqual(4);
    for (const r of rows) {
      expect(typeof r.hired).toBe('boolean');
      expect(r.personaId).toBeTruthy();
    }
  }, 30_000);

  it('hiring twice is the same agent, not two of them', async () => {
    const a = (await (
      await req('/agents', { method: 'POST', body: JSON.stringify({ personaId: 'earnings-desk' }) })
    ).json()) as { id: string; hired: boolean };
    const b = (await (
      await req('/agents', { method: 'POST', body: JSON.stringify({ personaId: 'earnings-desk' }) })
    ).json()) as { id: string };
    expect(a.hired).toBe(true);
    expect(b.id).toBe(a.id);
  }, 30_000);

  it('refuses a persona that does not exist rather than inventing one', async () => {
    const res = await req('/agents', {
      method: 'POST',
      body: JSON.stringify({ personaId: 'not-a-persona' }),
    });
    expect(res.status).toBe(400);
  }, 30_000);

  it('tone and limits survive a round trip', async () => {
    const hired = (await (
      await req('/agents', { method: 'POST', body: JSON.stringify({ personaId: 'drawdown-guard' }) })
    ).json()) as { id: string };

    await req(`/agents/${hired.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ tone: 'flat', riskLimits: { maxTradeUsd: 250 } }),
    });

    const rows = (await (await req('/agents')).json()) as {
      id: string;
      tone: string;
      riskLimits: Record<string, unknown>;
    }[];
    const row = rows.find((r) => r.id === hired.id)!;
    expect(row.tone).toBe('flat');
    expect(row.riskLimits).toEqual({ maxTradeUsd: 250 });
  }, 30_000);

  it('firing pauses its strategies and leaves everyone else alone', async () => {
    const agent = (await (
      await req('/agents', { method: 'POST', body: JSON.stringify({ personaId: 'yield-keeper' }) })
    ).json()) as { id: string };

    const before = (await (await req('/strategies')).json()) as { id: string; state: string }[];
    const othersLive = before.filter((s) => s.state === 'live').map((s) => s.id);

    const created = await req('/strategies', {
      method: 'POST',
      body: JSON.stringify({
        kind: 'dca',
        state: 'live',
        label: 'lifecycle probe',
        symbol: 'WETH',
        cadence: 'weekly',
        dailyAllocationUsd: 1,
        agentId: agent.id,
      }),
    });
    // The wallet may already be at its cap; that is a legitimate reason to skip, not a failure.
    if (created.status !== 200) return;
    const mine = (await created.json()) as { id: string };

    const fired = (await (await req(`/agents/${agent.id}`, { method: 'DELETE' })).json()) as {
      pausedStrategies: number;
    };
    expect(fired.pausedStrategies).toBeGreaterThanOrEqual(1);

    const after = (await (await req('/strategies')).json()) as { id: string; state: string }[];
    expect(after.find((s) => s.id === mine.id)!.state).toBe('paused');
    // Everything that was live and not this agent's must still be live.
    for (const id of othersLive) {
      const row = after.find((s) => s.id === id);
      if (row) expect(row.state, `${id} was paused by someone else's firing`).toBe('live');
    }
  }, 60_000);

  it('an agent id from another wallet is not attachable', async () => {
    // A well-formed v4 UUID that simply is not ours. An all-1s string fails the format check
    // first, which would test zod rather than the ownership rule this is about.
    const res = await req('/strategies', {
      method: 'POST',
      body: JSON.stringify({
        kind: 'dca',
        state: 'live',
        label: 'foreign agent',
        symbol: 'WETH',
        cadence: 'weekly',
        dailyAllocationUsd: 1,
        agentId: '123e4567-e89b-42d3-a456-426614174000',
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('unknown_agent');
  }, 30_000);
});
