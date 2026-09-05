/**
 * The Graph — the venue half of the agent's picture.
 *
 * This is a SECOND, independent subgraph over a DIFFERENT protocol on a different network: the
 * official 1inch Aqua deployment on Base mainnet, indexed in subgraph-aqua/. The delegation index
 * answers "what is this user allowing me to spend today". This one answers "is there anything to
 * trade against, and how deep is it".
 *
 * Composing the two is what makes the routing decision possible at all. A permission with no venue
 * and a venue with no permission are both dead ends, and neither index can see the other's half.
 * `decide()` joins them and picks Aqua or the 1inch aggregator on the answer.
 *
 * Aqua never custodies, so depth here is derived from indexed Pulled/Pushed flow rather than read
 * off a contract balance — a book that showed a token balance on chain would be a book that had
 * escrowed, which is the thing Aqua exists not to do.
 */
import 'dotenv/config';

const ENDPOINT = process.env.AQUA_SUBGRAPH_URL ?? '';

export type Book = {
  id: string;
  maker: string;
  app: string;
  open: boolean;
  fillCount: number;
  balances: { token: string; amount: string }[];
};

/** Distinguishes "no book" from "we could not look", so the agent never guesses which it was. */
export class AquaIndexUnavailable extends Error {
  constructor(detail: string) {
    super(`The Aqua index is unreachable: ${detail}`);
    this.name = 'AquaIndexUnavailable';
  }
}

export function aquaIndexConfigured(): boolean {
  return ENDPOINT.length > 0;
}

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  if (!ENDPOINT) throw new AquaIndexUnavailable('AQUA_SUBGRAPH_URL is not set');
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
  if (!res.ok) throw new AquaIndexUnavailable(`${res.status}`);
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new AquaIndexUnavailable(json.errors[0]!.message);
  if (!json.data) throw new AquaIndexUnavailable('no data');
  return json.data;
}

export async function health(): Promise<{ block: number; healthy: boolean }> {
  const d = await gql<{ _meta: { block: { number: number }; hasIndexingErrors: boolean } }>(
    `{ _meta { block { number } hasIndexingErrors } }`,
  );
  return { block: d._meta.block.number, healthy: !d._meta.hasIndexingErrors };
}

/**
 * Open books belonging to a given Aqua app — ours, unless asked otherwise.
 *
 * Sorted by fill count: a book that has actually traded is a better bet than one that shipped and
 * never quoted, and that ordering is only knowable from indexed history.
 */
export async function openBooks(app: string, first = 25): Promise<Book[]> {
  const d = await gql<{ strategies: Book[] }>(
    `query Books($app: Bytes!, $first: Int!) {
      strategies(
        where: { app: $app, open: true }
        orderBy: fillCount
        orderDirection: desc
        first: $first
      ) {
        id
        maker
        app
        open
        fillCount
        balances { token amount }
      }
    }`,
    { app: app.toLowerCase(), first },
  );
  return d.strategies;
}

/** Live depth of one token in one book, in that token's base units. */
export function depthOf(book: Book, token: string): bigint {
  const row = book.balances.find((b) => b.token.toLowerCase() === token.toLowerCase());
  return row ? BigInt(row.amount) : 0n;
}

/**
 * The deepest open book that could fill `amount` of `tokenOut`, or null if none can.
 *
 * Null is a real answer: it means route to the aggregator instead. It is not the same as the index
 * being unreachable, which throws.
 */
export async function bestBookFor(
  app: string,
  tokenOut: string,
  amount: bigint,
): Promise<Book | null> {
  const books = await openBooks(app);
  let best: Book | null = null;
  let bestDepth = 0n;
  for (const b of books) {
    const depth = depthOf(b, tokenOut);
    if (depth >= amount && depth > bestDepth) {
      best = b;
      bestDepth = depth;
    }
  }
  return best;
}
