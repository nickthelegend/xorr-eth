import { describe, expect, it, vi } from 'vitest';
import { Keypair, PublicKey } from '@solana/web3.js';
import {
  usdToBaseUnits,
  baseUnitsToUsd,
  readDelegation,
} from './delegation.js';

const getAccountMock = vi.fn();

vi.mock('@solana/spl-token', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@solana/spl-token')>();
  return {
    ...actual,
    getAccount: (...args: unknown[]) => getAccountMock(...args),
  };
});

describe('solana SPL delegation', () => {
  it('usdToBaseUnits and baseUnitsToUsd convert correctly', () => {
    const units = usdToBaseUnits(123.45, 6);
    expect(units).toBe(123450000n);

    const usd = baseUnitsToUsd(123450000n, 6);
    expect(usd).toBe(123.45);
  });

  it('readDelegation parses active delegated SPL account', async () => {
    const owner = Keypair.generate().publicKey;
    const delegate = Keypair.generate().publicKey;

    getAccountMock.mockResolvedValueOnce({
      delegate,
      delegatedAmount: 500_000_000n, // $500
      amount: 1_000_000_000n, // $1000
    });

    const res = await readDelegation(owner);
    expect(res).not.toBeNull();
    expect(res!.delegate).toBe(delegate.toBase58());
    expect(res!.delegatedUsd).toBe(500);
    expect(res!.amountUsd).toBe(1000);
    expect(res!.revoked).toBe(false);
  });

  it('readDelegation marks state as revoked if delegate is null or amount 0', async () => {
    const owner = Keypair.generate().publicKey;

    getAccountMock.mockResolvedValueOnce({
      delegate: null,
      delegatedAmount: 0n,
      amount: 1_000_000_000n,
    });

    const res = await readDelegation(owner);
    expect(res).not.toBeNull();
    expect(res!.delegate).toBeNull();
    expect(res!.delegatedUsd).toBe(0);
    expect(res!.revoked).toBe(true);
  });

  it('readDelegation returns null if token account does not exist', async () => {
    const owner = Keypair.generate().publicKey;

    getAccountMock.mockRejectedValueOnce(new Error('TokenAccountNotFoundError'));

    const res = await readDelegation(owner);
    expect(res).toBeNull();
  });
});
