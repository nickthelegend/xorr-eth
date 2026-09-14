/**
 * Signing out forgets the person and keeps the device (`forgetAccount`).
 *
 * Sign-out cleared `wallet` alone, so the next account on the same phone was told Recovery was "Done", inherited a
 * pulled stop switch and started onboarding from someone else's answers.
 */
import { describe, expect, it, vi } from 'vitest';
import type { Wallet } from '../data/types';

vi.mock('@react-native-async-storage/async-storage', () => {
  const memory = new Map<string, string>();
  return {
    default: {
      getItem: async (key: string) => memory.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        memory.set(key, value);
      },
      removeItem: async (key: string) => {
        memory.delete(key);
      },
    },
  };
});

const { useStore } = await import('./store');

const WALLET: Wallet = {
  address: '0x95A0b368588713011a15f4b1041423f31B08e615',
  kind: 'embedded',
  cluster: 'base-fork',
};

describe('forgetAccount', () => {
  it('puts back everything that belonged to the person who signed out', () => {
    const s = useStore.getState();
    s.setWallet(WALLET);
    s.setWalletChecked(true);
    s.setRecoveryBackedUp(true);
    s.setKilled(true);
    s.toggleHire('Momentum Scout');
    s.setRiskQ(3);
    s.bumpCap(1);
    s.setApproved(true);

    useStore.getState().forgetAccount();

    const after = useStore.getState();
    expect(after.wallet).toBeNull();
    expect(after.walletChecked).toBe(false);
    expect(after.recoveryBackedUp).toBe(false);
    expect(after.killed).toBe(false);
    expect(after.hired).toEqual({});
    expect(after.riskQ).toBe(1);
    expect(after.cap).toBe(1600);
    expect(after.approved).toBe(false);
  });

  it('keeps what belongs to the device', () => {
    const s = useStore.getState();
    s.setLbSort(2);
    s.setMkt(0);
    s.setActFilter(3);

    useStore.getState().forgetAccount();

    const after = useStore.getState();
    expect(after.lbSort).toBe(2);
    expect(after.mkt).toBe(0);
    expect(after.actFilter).toBe(3);
    // And the actions themselves survive the reset.
    expect(typeof after.forgetAccount).toBe('function');
  });
});
