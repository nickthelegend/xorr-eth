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

export async function currentWallet(c: Context): Promise<WalletRow | undefined> {
  const { userId } = requireUser(c);
  return one<WalletRow>(`SELECT * FROM wallets WHERE user_id = $1 LIMIT 1`, [userId]);
}

export async function requireWallet(c: Context): Promise<WalletRow> {
  const w = await currentWallet(c);
  if (!w) throw new Error('No wallet for this user. POST /wallet/create first.');
  return w;
}
