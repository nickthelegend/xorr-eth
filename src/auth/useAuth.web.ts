/**
 * The web half of the auth surface. Same shape as useAuth.native.ts, so screens are identical
 * across platforms — see PrivyProvider.web.tsx for why the split exists.
 */
import { useCallback, useMemo } from 'react';
import { usePrivy, useLoginWithEmail, useWallets, useCreateWallet } from '@privy-io/react-auth';
import { alreadyHasWallet } from './alreadyHasWallet';

export type AuthState = {
  ready: boolean;
  authenticated: boolean;
  userId?: string;
  address?: string;
  email?: string;
};

export function useAuth(): AuthState & {
  logout: () => Promise<void>;
  createWallet: () => Promise<string | undefined>;
} {
  const { ready, authenticated, user, logout } = usePrivy();
  const { wallets } = useWallets();
  const { createWallet: create } = useCreateWallet();

  const address = wallets?.[0]?.address;

  const createWallet = useCallback(async () => {
    if (address) return address;
    try {
      const w = await create();
      return w?.address;
    } catch (e) {
      // See alreadyHasWallet: right after login the SDK's wallet list is briefly empty, so a
      // returning user trips Privy's "one embedded wallet only" refusal on the happy path.
      if (!alreadyHasWallet(e)) throw e;
      return undefined;
    }
  }, [address, create]);

  return useMemo(
    () => ({
      ready,
      authenticated,
      userId: user?.id,
      address,
      email: user?.email?.address,
      logout,
      createWallet,
    }),
    [ready, authenticated, user, address, logout, createWallet],
  );
}

export function useEmailLogin() {
  const { sendCode, loginWithCode, state } = useLoginWithEmail();
  return { sendCode, loginWithCode, state };
}
