/**
 * Solana Keypair loaders — PLAN.md §8.1.
 *
 * Provides delegate, payer, and dev-owner keypairs.
 * Never logs or prints secret keys.
 */
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function parseKeySecret(val: string): Uint8Array {
  const trimmed = val.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return Uint8Array.from(JSON.parse(trimmed));
  }
  return bs58.decode(trimmed);
}

function loadKeypair(name: string, envVar: string, seedString: string): Keypair {
  const envVal = process.env[envVar];
  if (envVal) {
    try {
      return Keypair.fromSecretKey(parseKeySecret(envVal));
    } catch {
      // Fallback if parsing fails
    }
  }

  const keyDir = process.env.XORR_KEY_DIR;
  if (keyDir) {
    const filePath = path.join(keyDir, `${name}.json`);
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        return Keypair.fromSecretKey(parseKeySecret(raw));
      } catch {
        // Fallback
      }
    }
  }

  // Deterministic fallback for test & fork environments
  const hash = crypto.createHash('sha256').update(`xorr-solana-${name}-${seedString}`).digest();
  return Keypair.fromSeed(hash);
}

let _delegate: Keypair | null = null;
let _payer: Keypair | null = null;
let _devOwner: Keypair | null = null;

export function delegateKeypair(): Keypair {
  if (!_delegate) {
    _delegate = loadKeypair('delegate', 'XORR_KEY_DELEGATE', 'delegate-seed-2026');
  }
  return _delegate;
}

export function payerKeypair(): Keypair {
  if (!_payer) {
    _payer = loadKeypair('payer', 'XORR_KEY_PAYER', 'payer-seed-2026');
  }
  return _payer;
}

export function devOwnerKeypair(): Keypair {
  if (!_devOwner) {
    _devOwner = loadKeypair('dev-owner', 'XORR_KEY_DEV_OWNER', 'dev-owner-seed-2026');
  }
  return _devOwner;
}
