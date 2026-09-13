/**
 * The caller's wallet, scoped to the authenticated Privy user.
 *
 * Extracted so a route module can be split out of `index.ts` without taking a copy of this with
 * it. Two copies of "which wallet is this" is exactly the shape of bug that made the previous
 * build read "the first wallet row" — fine for one user on a laptop, catastrophic for two.
 */
import type { Context } from 'hono';
import { one } from '../db/index.js';
import { requireUser } from '../auth/middleware.js';

export type WalletRow = {
  id: string;
  address: string;
  kind: string;
  cluster: string;
  user_id: string;
  /** When the user last read their catch-up. Distinct from `active_at`; see migration 011. */
  last_seen_at: Date | null;
};

/**
 * The user's wallet — and `LIMIT 1` is not enough on its own to say which.
 *
 * A user can end up with more than one row here, and it is not hypothetical: web Privy lists any
 * injected browser extension alongside the embedded wallet, and until `pickEmbedded` landed the app
 * registered whichever the SDK happened to put first. So an account that once connected through an
 * extension has that address on file AND the embedded one, and this query — with no ORDER BY — was
 * free to return either, differently between calls.
 *
 * Which it returns decides whose policy is read, whose balance is shown and whose trail is written,
 * so "whatever Postgres feels like" is not an acceptable answer.
 *
 * It was then "newest row wins", which is still a guess, and on the E2E account it guessed wrong:
 * the app signs in as an embedded wallet created on the 5th while the newest row is a connected
 * one from the 8th. Everything downstream read the wrong wallet — /limits reported a $0 cap and
 * `no_delegation` for an account holding a live $1,600 on-chain grant, and refused to create a
 * strategy on those grounds. The app was right and the server was answering about someone else.
 *
 * `active_at` is stamped by `/wallet/connect`, which is the app stating the address it is on. So
 * the answer is now something the client asserts each session rather than something inferred from
 * row age. `created_at` and `id` still break ties, and `id` being the primary key makes the
 * ordering total.
 */
export async function currentWallet(c: Context): Promise<WalletRow | undefined> {
  const { userId } = requireUser(c);
  return one<WalletRow>(
    `SELECT * FROM wallets WHERE user_id = $1
      ORDER BY active_at DESC NULLS LAST, created_at DESC, id DESC LIMIT 1`,
    [userId],
  );
}

/**
 * A signed-in user with no wallet registered yet, on a route that needs one.
 *
 * This was a plain `Error`, so the global handler answered 500 — "the server is broken, retry" — to
 * an account that simply had not finished onboarding, and the 409 the situation deserves never
 * reached the client. 409: the request is fine; the account's state is what has to change first.
 */
export class NoWalletError extends Error {
  readonly status = 409;
  constructor() {
    super('No wallet for this user. POST /wallet/create first.');
    this.name = 'NoWalletError';
  }
}

export async function requireWallet(c: Context): Promise<WalletRow> {
  const w = await currentWallet(c);
  if (!w) throw new NoWalletError();
  return w;
}
