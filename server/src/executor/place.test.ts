import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Keypair } from '@solana/web3.js';

const oneMock = vi.fn();
const queryMock = vi.fn();
const txMock = vi.fn((callback: (client: unknown) => Promise<unknown>) =>
  callback({ query: queryMock }),
);
const evaluateMock = vi.fn();
const readDelegationMock = vi.fn();
const quoteJupiterMock = vi.fn();
const buildJupiterSwapMock = vi.fn();
const executeJupiterSwapMock = vi.fn();

vi.mock('../db/index.js', () => ({
  one: (...args: unknown[]) => oneMock(...args),
  query: (...args: unknown[]) => queryMock(...args),
  tx: (cb: (client: unknown) => Promise<unknown>) => txMock(cb),
}));

vi.mock('../rules/engine.js', () => ({
  evaluate: (...args: unknown[]) => evaluateMock(...args),
  recordSpend: vi.fn(),
}));

vi.mock('../solana/delegation.js', () => ({
  readDelegation: (...args: unknown[]) => readDelegationMock(...args),
  usdToBaseUnits: (usd: number, decimals: number) => Math.floor(usd * 10 ** decimals),
}));

const mockKeypair = Keypair.generate();
vi.mock('../solana/keys.js', () => ({
  delegateKeypair: () => mockKeypair,
}));

vi.mock('../venues/jupiter.js', () => ({
  quoteJupiter: (...args: unknown[]) => quoteJupiterMock(...args),
  buildJupiterSwap: (...args: unknown[]) => buildJupiterSwapMock(...args),
  executeJupiterSwap: (...args: unknown[]) => executeJupiterSwapMock(...args),
}));

const { guardAndSpend, SpendRefusalError } = await import('./place.js');

const VALID_SOLANA_OWNER = Keypair.generate().publicKey.toBase58();

describe('guardAndSpend executor chokepoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMock.mockResolvedValue({ rows: [] });
  });

  it('rejects unsupported non-stock symbols', async () => {
    await expect(
      guardAndSpend({
        walletId: 'wallet-1',
        ownerAddress: VALID_SOLANA_OWNER,
        usd: 50,
        symbol: 'SOL',
        venue: 'jupiter',
        because: 'test',
      }),
    ).rejects.toThrow(SpendRefusalError);
  });

  it('rejects if wallet is missing from DB', async () => {
    oneMock.mockResolvedValue(null);
    await expect(
      guardAndSpend({
        walletId: 'wallet-nonexistent',
        ownerAddress: VALID_SOLANA_OWNER,
        usd: 50,
        symbol: 'NVDAx',
        venue: 'jupiter',
        because: 'test',
      }),
    ).rejects.toMatchObject({ reason: 'no_wallet' });
  });

  it('rejects if rules evaluation fails (e.g. agents stopped)', async () => {
    oneMock.mockResolvedValue({
      id: 'wallet-1',
      address: VALID_SOLANA_OWNER,
      agents_stopped: true,
    });
    readDelegationMock.mockResolvedValue({
      delegatedUsd: 500,
      revoked: false,
    });
    evaluateMock.mockResolvedValue({
      allowed: false,
      reason: 'agents_stopped',
      detail: 'You stopped the agents.',
    });

    await expect(
      guardAndSpend({
        walletId: 'wallet-1',
        ownerAddress: VALID_SOLANA_OWNER,
        usd: 50,
        symbol: 'NVDAx',
        venue: 'jupiter',
        because: 'test',
      }),
    ).rejects.toMatchObject({ reason: 'agents_stopped' });
  });

  it('executes real Jupiter fill and records atomic state on approval', async () => {
    oneMock.mockResolvedValue({
      id: 'wallet-1',
      address: VALID_SOLANA_OWNER,
      agents_stopped: false,
    });
    readDelegationMock.mockResolvedValue({
      delegatedUsd: 1000,
      revoked: false,
    });
    evaluateMock.mockResolvedValue({
      allowed: true,
      remainingUsd: 950,
    });
    quoteJupiterMock.mockImplementation(async ({ amount }: { amount: number }) => ({
      inAmountUnits: amount,
      outAmountUnits: Math.floor((amount * 100) / 216.5),
      rawQuote: { mock: 'quote' },
    }));
    buildJupiterSwapMock.mockResolvedValue({
      swapTransaction: 'base64EncodedSwapTx',
    });
    executeJupiterSwapMock.mockResolvedValue({
      signature: '5K3yTestSolanaSwapSignature',
      slot: 289412948,
    });

    const receipt = await guardAndSpend({
      walletId: 'wallet-1',
      ownerAddress: VALID_SOLANA_OWNER,
      usd: 50,
      symbol: 'NVDAx',
      venue: 'jupiter',
      because: 'Autonomous breakout momentum entry',
      agentName: 'Momentum Scout',
    });

    expect(receipt.signature).toBe('5K3yTestSolanaSwapSignature');
    expect(receipt.slot).toBe(289412948);
    expect(receipt.symbol).toBe('NVDAx');
    expect(receipt.usd).toBe(50);
    expect(receipt.units).toBeCloseTo(0.2309, 3);
    expect(receipt.price).toBeGreaterThan(200);

    // Verify DB transaction was opened to record fill and audit log
    expect(txMock).toHaveBeenCalledTimes(1);
    expect(queryMock).toHaveBeenCalled();
  });
});
