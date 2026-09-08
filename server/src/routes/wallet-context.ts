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
 * so "whatever Postgres feels like" is not an acceptable answer. Newest wins: the most recent
 * connect is the wallet the app is actually using, and the ordering is a total one because `id` is
 * the primary key and breaks any tie in `created_at`.
 */
export async function currentWallet(c: Context): Promise<WalletRow | undefined> {
  const { userId } = requireUser(c);
  return one<WalletRow>(
    `SELECT * FROM wallets WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
    [userId],
  );
}

export async function requireWallet(c: Context): Promise<WalletRow> {
  const w = await currentWallet(c);
  if (!w) throw new Error('No wallet for this user. POST /wallet/create first.');
  return w;
}
