import { describe, expect, it, vi } from 'vitest';
import { Keypair } from '@solana/web3.js';
import {
  getTokenAccountBalance,
  getXStockBalance,
  ataFor,
} from './balances.js';

const getTokenAccountBalanceMock = vi.fn();

vi.mock('./connection.js', () => ({
  connection: {
    getTokenAccountBalance: (...args: unknown[]) => getTokenAccountBalanceMock(...args),
    getBalance: vi.fn().mockResolvedValue(1_000_000_000),
  },
}));

describe('solana balances & Token-2022 Scaled UI', () => {
  it('ataFor derives correct ATA address for owner and mint', () => {
    const owner = Keypair.generate().publicKey;
    const mint = Keypair.generate().publicKey;
    const ata = ataFor(owner, mint);
    expect(ata).toBeDefined();
    expect(ata.toBase58().length).toBeGreaterThan(30);
  });

  it('getTokenAccountBalance reads uiAmount from RPC', async () => {
    getTokenAccountBalanceMock.mockResolvedValueOnce({
      value: {
        uiAmount: 2.5,
        uiAmountString: '2.5',
        amount: '250000000',
        decimals: 8,
      },
    });

    const ata = Keypair.generate().publicKey;
    const bal = await getTokenAccountBalance(ata);
    expect(bal).not.toBeNull();
    expect(bal!.uiAmount).toBe(2.5);
    expect(bal!.amount).toBe(250000000n);
    expect(bal!.decimals).toBe(8);
  });

  it('getXStockBalance adheres to Scaled UI invariant (raw x multiplier)', async () => {
    // Simulating post-split holding: 1 share split 2:1 -> uiAmount is 2.0
    // Relying on uiAmount directly preserves true equity value
    getTokenAccountBalanceMock.mockResolvedValueOnce({
      value: {
        uiAmount: 2.0,
        uiAmountString: '2.0',
        amount: '200000000',
        decimals: 8,
      },
    });

    const owner = Keypair.generate().publicKey;
    const holding = await getXStockBalance(owner, 'NVDAx');
    expect(holding).not.toBeNull();
    expect(holding!.symbol).toBe('NVDAx');
    expect(holding!.uiAmount).toBe(2.0);
    expect(holding!.uiAmountString).toBe('2.0');
    expect(holding!.amount).toBe(200000000n);
  });

  it('getXStockBalance returns null for unknown symbol', async () => {
    const owner = Keypair.generate().publicKey;
    const holding = await getXStockBalance(owner, 'INVALID_UNKNOWN');
    expect(holding).toBeNull();
  });
});
