/**
 * viem clients and the executor's delegate key.
 *
 * The DELEGATE key lives here because the executor must sign a scheduled trade with nobody
 * present. Its blast radius is bounded by XorrDelegation: capped per day, venue-allowlisted,
 * time-boxed, and revocable by the user without our cooperation.
 *
 * The OWNER key never lives here — that is Privy's embedded wallet, on the user's side.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, createWalletClient, http, type Hex } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { chain, rpcUrl } from './chains.js';

const KEY_DIR = process.env.XORR_KEY_DIR ?? path.join(import.meta.dirname, '../../.keys');

function loadOrCreateKey(name: string): Hex {
  fs.mkdirSync(KEY_DIR, { recursive: true });
  const file = path.join(KEY_DIR, `${name}.key`);
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim() as Hex;
  const key = generatePrivateKey();
  fs.writeFileSync(file, key, { mode: 0o600 });
  return key;
}

/**
 * The bot's signing key.
 *
 * In production this belongs in a KMS or an HSM — a file on a host is adequate for a local fork
 * and is NOT adequate beyond that. Recorded as an open item rather than glossed over.
 */
export const delegateAccount = privateKeyToAccount(
  (process.env.DELEGATE_PRIVATE_KEY as Hex) ?? loadOrCreateKey('delegate'),
);

/**
 * `cacheTime: 0`, because every read this client makes is a safety read.
 *
 * viem caches the latest block number for four seconds by default and resolves `readContract`
 * against it. So for up to four seconds after a user revokes, `readPolicy` still returned the
 * policy as LIVE — and the bot went on trading with it. A close placed inside that window
 * succeeded on a revoked permission, which is the kill switch failing at the only moment it
 * exists for.
 *
 * The README's claim is "revoke needs only the owner's signature: no server, no oracle, no
 * cooperation from the bot". A four-second window where the bot has not noticed is cooperation.
 *
 * The cost is one `eth_blockNumber` per read, against a policy read, a balance read and a gas
 * check that were each already a round trip. Nothing this executor reads is worth being stale:
 * not the policy, not the balances it sizes a trade from, not the gas it decides it can afford.
 */
export const publicClient = createPublicClient({ chain, transport: http(rpcUrl), cacheTime: 0 });

export const walletClient = createWalletClient({
  account: delegateAccount,
  chain,
  transport: http(rpcUrl),
});

export const KEY_DIRECTORY = KEY_DIR;
