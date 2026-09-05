/**
 * Authentication — Privy.
 *
 * This closes the largest hole in the previous build: the executor had NO auth, so any caller
 * could reach every route and act on any wallet. Every request now carries a Privy access token,
 * the token is verified against Privy's public keys, and the resulting user id scopes every query.
 *
 * Privy is also the embedded-wallet provider, which means the user identity and the wallet that
 * signs are the same object — there is no separate account system to keep in sync.
 */
import { PrivyClient } from '@privy-io/server-auth';
import 'dotenv/config';

const APP_ID = process.env.PRIVY_APP_ID;
const APP_SECRET = process.env.PRIVY_APP_SECRET;

if (!APP_ID || !APP_SECRET) {
  throw new Error(
    'PRIVY_APP_ID and PRIVY_APP_SECRET are required. The executor refuses to start without auth — ' +
      'an unauthenticated trading server is the one configuration that must never be possible.',
  );
}

export const privy = new PrivyClient(APP_ID, APP_SECRET);

export type AuthedUser = {
  /** Privy DID, e.g. did:privy:xxx. The primary key for everything this user owns. */
  userId: string;
  /** The embedded wallet address Privy manages for them, when they have one. */
  walletAddress?: string;
  email?: string;
};

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor(detail: string) {
    super(detail);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Verify a Privy access token and return the user it belongs to.
 * Throws rather than returning null: a route that forgets to check a null cannot leak data.
 */
export async function verifyToken(authorization: string | undefined): Promise<AuthedUser> {
  const token = authorization?.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new UnauthorizedError('Missing bearer token.');

  let claims;
  try {
    claims = await privy.verifyAuthToken(token);
  } catch (e) {
    throw new UnauthorizedError(
      `Invalid or expired token${e instanceof Error ? `: ${e.message}` : ''}`,
    );
  }

  const user = await privy.getUser(claims.userId).catch(() => null);
  const wallet = user?.linkedAccounts?.find(
    (a): a is typeof a & { address: string } =>
      a.type === 'wallet' && typeof (a as { address?: unknown }).address === 'string',
  );
  const email = user?.linkedAccounts?.find(
    (a): a is typeof a & { address: string } =>
      a.type === 'email' && typeof (a as { address?: unknown }).address === 'string',
  );

  return {
    userId: claims.userId,
    walletAddress: wallet?.address,
    email: email?.address,
  };
}
