/**
 * The app's view of who is signed in and which wallet signs.
 *
 * Wraps Privy so the rest of the app never imports its SDK directly — the same reason every
 * screen goes through a repository rather than calling fetch.
 */
import { useCallback, useMemo } from 'react';
import { usePrivy, useEmbeddedEthereumWallet, useLoginWithEmail } from '@privy-io/expo';

export type AuthState = {
  ready: boolean;
  authenticated: boolean;
  userId?: string;
  /** The embedded wallet address — the `owner` in the on-chain delegation policy. */
  address?: string;
  email?: string;
};

export function useAuth(): AuthState & {
  logout: () => Promise<void>;
  createWallet: () => Promise<string | undefined>;
} {
  const { user, isReady, logout } = usePrivy();
  const { wallets, create } = useEmbeddedEthereumWallet();

  const address = wallets?.[0]?.address;
  const email = user?.linked_accounts?.find((a) => a.type === 'email') as
    | { address?: string }
    | undefined;

  const createWallet = useCallback(async () => {
    if (address) return address;
    // create() resolves to a provider, not a wallet record — the address lands in `wallets` on
    // the next render, so the caller reads it from there.
    await create();
    return undefined;
  }, [address, create]);

  return useMemo(
    () => ({
      ready: isReady,
      authenticated: !!user,
      userId: user?.id,
      address,
      email: email?.address,
      logout,
      createWallet,
    }),
    [isReady, user, address, email?.address, logout, createWallet],
  );
}

/** Email OTP login — the flow the onboarding screen drives. */
export function useEmailLogin() {
  const { sendCode, loginWithCode, state } = useLoginWithEmail();
  return { sendCode, loginWithCode, state };
}
