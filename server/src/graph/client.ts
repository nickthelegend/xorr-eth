/**
 * The Graph — the agent's source of truth about what has actually happened on-chain.
 *
 * The prize requires The Graph to be LOAD-BEARING: "reasoning, decisions, automation, not just
 * printing a raw query result." So this is not a history feed for a screen. The bot queries it
 * before it acts, and the answers change what it does:
 *
 *   - it will not re-ship a book it can see is already open,
 *   - it sizes a trade against spend the CHAIN recorded, not against our own database,
 *   - it backs off a book whose realised flow is one-sided, because that is what being run over
 *     by an informed trader looks like from the outside.
 *
 * Reading our own Postgres for any of that would be circular: our database records what we
 * INTENDED. The subgraph records what settled.
 */
import 'dotenv/config';

const ENDPOINT =
  process.env.SUBGRAPH_URL ?? 'https://api.studio.thegraph.com/query/1758741/xorr/v0.0.2';

export type Policy = {
  id: string;
  owner: string;
  delegate: string;
  dailyCap: string;
  expiresAt: string;
  revoked: boolean;
  totalSpent: string;
};

export type Spend = {
  id: string;
  amount: string;
  spentToday: string;
  venue: string;
  token: string;
  txHash: string;
  timestamp: string;
};

export type DailySpend = { day: string; total: string; tradeCount: number };

export class SubgraphUnavailable extends Error {
  constructor(detail: string) {
    super(`The Graph is unreachable: ${detail}`);
    this.name = 'SubgraphUnavailable';
  }
}

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(process.env.GRAPH_API_KEY
        ? { authorization: `Bearer ${process.env.GRAPH_API_KEY}` }
        : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new SubgraphUnavailable(`${res.status}`);
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new SubgraphUnavailable(json.errors[0]!.message);
  if (!json.data) throw new SubgraphUnavailable('no data');
  return json.data;
}

export function unitsToUsd(units: string, decimals = 6): number {
  return Number(units) / 10 ** decimals;
}

export async function health(): Promise<{ block: number; healthy: boolean }> {
  const d = await gql<{ _meta: { block: { number: number }; hasIndexingErrors: boolean } }>(
    `{ _meta { block { number } hasIndexingErrors } }`,
  );
  return { block: d._meta.block.number, healthy: !d._meta.hasIndexingErrors };
}

export async function policyFor(owner: string): Promise<Policy | null> {
  const d = await gql<{ policy: Policy | null }>(
    `query P($id: ID!) { policy(id: $id) { id owner delegate dailyCap expiresAt revoked totalSpent } }`,
    { id: owner.toLowerCase() },
  );
  return d.policy;
}

export async function spendsFor(owner: string, first = 100): Promise<Spend[]> {
  const d = await gql<{ spends: Spend[] }>(
    `query S($owner: Bytes!, $first: Int!) {
      spends(where: { owner: $owner }, orderBy: timestamp, orderDirection: desc, first: $first) {
        id amount spentToday venue token txHash timestamp
      }
    }`,
    { owner: owner.toLowerCase(), first },
  );
  return d.spends;
}

export async function dailySpendFor(owner: string, first = 14): Promise<DailySpend[]> {
  const d = await gql<{ dailySpends: DailySpend[] }>(
    `query D($owner: Bytes!, $first: Int!) {
      dailySpends(where: { owner: $owner }, orderBy: day, orderDirection: desc, first: $first) {
        day total tradeCount
      }
    }`,
    { owner: owner.toLowerCase(), first },
  );
  return d.dailySpends;
}
