/**
 * Health and metrics — the two questions an operator asks, answered honestly.
 *
 * `/health` returned `{ ok: true }` if the process was alive enough to answer, which is the least
 * informative thing a health check can say: a server whose database is gone and whose RPC is
 * unreachable answers it exactly as cheerfully as a healthy one. Every dependency that a request
 * can fail on is checked, with the latency it took, and the overall status is the worst of them.
 *
 * The distinction that matters is `degraded` vs `down`. A missing price feed means the market
 * screens show dashes; a missing database means nothing works at all. Collapsing those into one
 * boolean is how a load balancer ends up cycling a server that was fine.
 */
import { Hono } from 'hono';
import { query } from '../db/index.js';
import { publicClient } from '../evm/client.js';
import { CHAIN_KEY } from '../evm/chains.js';
import { DELEGATION_ADDRESS, delegatePublicKey } from '../evm/delegation.js';
import { formatEther } from 'viem';
import { publicSurface } from '../auth/middleware.js';

export const ops = new Hono();

type DepStatus = 'up' | 'degraded' | 'down';
type Dep = { name: string; status: DepStatus; ms: number; detail: string; critical: boolean };

const started = Date.now();

async function probe(
  name: string,
  critical: boolean,
  fn: () => Promise<string>,
  timeoutMs = 5_000,
): Promise<Dep> {
  const t0 = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const detail = await Promise.race([
      fn(),
      new Promise<never>((_, rej) => {
        timer = setTimeout(() => rej(new Error(`no answer in ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
    return { name, status: 'up', ms: Date.now() - t0, detail, critical };
  } catch (e) {
    return {
      name,
      status: critical ? 'down' : 'degraded',
      ms: Date.now() - t0,
      detail: e instanceof Error ? e.message : String(e),
      critical,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * How much gas the bot has left, and whether that is enough to keep working.
 *
 * The delegate pays for every fill out of its own wallet. When it runs dry every strategy fails
 * inside the venue call, which surfaces to the user as "the venue rejected the order" — a sentence
 * that sends them looking at the market instead of at us. It is the most predictable outage this
 * system has and nothing was watching for it.
 */
const GAS_FLOOR_ETH = 0.01;

export async function gasStatus(): Promise<{
  eth: number;
  enough: boolean;
  floor: number;
  address: string;
}> {
  const eth = Number(formatEther(await publicClient.getBalance({ address: delegatePublicKey })));
  return { eth, enough: eth >= GAS_FLOOR_ETH, floor: GAS_FLOOR_ETH, address: delegatePublicKey };
}

ops.get('/health', async (c) => {
  const deps = await Promise.all([
    probe('postgres', true, async () => {
      const rows = await query<{ now: Date }>('SELECT now()');
      return `responded at ${rows[0]?.now?.toISOString()}`;
    }),
    probe('rpc', true, async () => `${CHAIN_KEY} at block ${await publicClient.getBlockNumber()}`),
    probe('delegation', true, async () => {
      const code = await publicClient.getCode({ address: DELEGATION_ADDRESS });
      if (!code || code.length <= 4) throw new Error(`no code at ${DELEGATION_ADDRESS}`);
      return `${(code.length - 2) / 2} bytes`;
    }),
    // Not critical: the bot being out of gas stops trading, and trading stopping is not the
    // server being broken. It is still the single most likely reason a strategy fails.
    probe('gas', false, async () => {
      const g = await gasStatus();
      if (!g.enough) throw new Error(`${g.eth.toFixed(4)} ETH, below the ${g.floor} floor`);
      return `${g.eth.toFixed(4)} ETH`;
    }),
  ]);

  const down = deps.some((d) => d.status === 'down');
  const degraded = deps.some((d) => d.status === 'degraded');
  const status: DepStatus = down ? 'down' : degraded ? 'degraded' : 'up';

  return c.json(
    {
      // Kept so existing callers and the README's curl still work: true whenever requests can be
      // served, which is what they were asking.
      ok: !down,
      status,
      chain: CHAIN_KEY,
      delegation: DELEGATION_ADDRESS,
      uptimeSec: Math.round((Date.now() - started) / 1000),
      dependencies: deps,
      // The old shape had `db` as a timestamp. Several things read it.
      db: deps.find((d) => d.name === 'postgres')?.detail,
      /*
       * What can be called without a session.
       *
       * Published so the client can mirror it rather than keep a second copy that silently drifts
       * — the same reason `tradable.ts` mirrors the token registry and a test fails when they
       * disagree.
       */
      publicSurface,
    },
    down ? 503 : 200,
  );
});

/**
 * Counters an operator would actually page on, read from the tables that hold them.
 *
 * Deliberately derived rather than incremented in memory: a counter that resets on restart tells
 * you about the last few minutes of a process, not about the system.
 */
ops.get('/metrics', async (c) => {
  const [runs, alerts, strategies, spend] = await Promise.all([
    query<{ status: string; n: string }>(
      `SELECT status, count(*) AS n FROM strategy_runs GROUP BY status`,
    ),
    query<{ n: string; fired: string }>(
      `SELECT count(*) AS n, COALESCE(SUM(fire_count),0) AS fired FROM alerts WHERE enabled`,
    ),
    query<{ state: string; n: string }>(
      `SELECT state, count(*) AS n FROM strategies GROUP BY state`,
    ),
    query<{ total: string }>(
      `SELECT COALESCE(SUM(spent_usd),0) AS total FROM daily_spend WHERE day = (now() AT TIME ZONE 'UTC')::date`,
    ),
  ]);

  const byStatus = Object.fromEntries(runs.map((r) => [r.status, Number(r.n)]));
  const filled = byStatus.filled ?? 0;
  const failed = byStatus.failed ?? 0;
  return c.json({
    runs: byStatus,
    /** The number worth alerting on: fills that did not happen because something broke. */
    runFailureRate: filled + failed > 0 ? failed / (filled + failed) : 0,
    strategies: Object.fromEntries(strategies.map((r) => [r.state, Number(r.n)])),
    alertsEnabled: Number(alerts[0]?.n ?? 0),
    alertsFiredTotal: Number(alerts[0]?.fired ?? 0),
    spentTodayUsd: Number(spend[0]?.total ?? 0),
    gas: await gasStatus().catch(() => null),
    uptimeSec: Math.round((Date.now() - started) / 1000),
  });
});
