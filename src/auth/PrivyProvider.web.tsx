/**
 * Privy on web.
 *
 * `@privy-io/expo` is a native-only SDK — it reads the app's bundle identifier and throws on
 * react-native-web. The web SDK is a separate package, so the provider is platform-split rather
 * than forced into one implementation. Metro picks `.web.tsx` for web and `.native.tsx` for
 * iOS/Android automatically; nothing else in the app knows the difference.
 */
import React from 'react';
import { PrivyProvider as WebProvider } from '@privy-io/react-auth';
import { baseSepolia, base } from 'viem/chains';
import { colors } from '@/ui';

const APP_ID = process.env.EXPO_PUBLIC_PRIVY_APP_ID;

if (!APP_ID) {
  throw new Error('EXPO_PUBLIC_PRIVY_APP_ID is required — the app has no offline login path.');
}

export function AppPrivyProvider({ children }: { children: React.ReactNode }) {
  return (
    <WebProvider
      appId={APP_ID!}
      config={{
        // A wallet is created on login for anyone who does not already have one, which is what
        // makes "sign in and you own a wallet" a single step rather than two.
        embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' } },
        loginMethods: ['email', 'wallet'],
        defaultChain: baseSepolia,
        supportedChains: [baseSepolia, base],
        appearance: {
          theme: 'dark',
          accentColor: colors.ink,
          showWalletLoginFirst: false,
        },
      }}
    >
      {children}
    </WebProvider>
  );
}

export const PRIVY_APP_ID = APP_ID;
export const SURFACE = colors.bg;
