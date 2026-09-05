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

export const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

export const walletClient = createWalletClient({
  account: delegateAccount,
  chain,
  transport: http(rpcUrl),
});

export const KEY_DIRECTORY = KEY_DIR;
