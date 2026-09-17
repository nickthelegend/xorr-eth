/**
 * Solana Keypair loading and generation (PLAN.md §8.1).
 * Never prints or logs private key material.
 */
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

export function parseKeypair(raw: string): Keypair {
  const trimmed = raw.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const bytes = JSON.parse(trimmed) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(bytes));
  }
  // Try base58 decode
  return Keypair.fromSecretKey(bs58.decode(trimmed));
}

let cachedDelegate: Keypair | undefined;
let cachedPayer: Keypair | undefined;

export function getDelegateKeypair(): Keypair {
  if (cachedDelegate) return cachedDelegate;

  const envKey = process.env.XORR_DELEGATE_KEY ?? process.env.DELEGATE_PRIVATE_KEY;
  if (envKey) {
    cachedDelegate = parseKeypair(envKey);
    return cachedDelegate;
  }

  // In test / dev environments, generate an ephemeral keypair if not configured
  cachedDelegate = Keypair.generate();
  return cachedDelegate;
}

export function getPayerKeypair(): Keypair {
  if (cachedPayer) return cachedPayer;

  const envKey = process.env.SOLANA_PAYER_KEY ?? process.env.XORR_PAYER_KEY;
  if (envKey) {
    cachedPayer = parseKeypair(envKey);
    return cachedPayer;
  }

  // If no payer key, use delegate keypair
  return getDelegateKeypair();
}
