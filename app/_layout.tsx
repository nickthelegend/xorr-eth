/**
 * Root layout. animations.md: "Screen transitions — use the platform default push/present.
 * Don't author custom ones."
 */
import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppPrivyProvider } from '@/auth/PrivyProvider';
import { colors } from '@/ui';
import { useRegisterDevice } from '@/notifications/useRegisterDevice';
import { useHydrateWallet } from '@/wallet/useHydrateWallet';

/**
 * Hold the splash until the typefaces are ready.
 *
 * At module scope on purpose: it has to run before the first render, and it used to sit
 * between the imports, which is both a lint error and a real hazard — a bundler is free to
 * hoist imports above it, and then the splash hides before the call lands.
 */
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

/**
 * Files this device's push token against the signed-in wallet.
 *
 * A component rather than a hook call in RootLayout so it sits INSIDE the Privy provider — the
 * wallet it keys on does not exist above it. Renders nothing.
 */
function DeviceRegistration() {
  useRegisterDevice();
  return null;
}

/**
 * Loads the signed-in user's wallet from the executor, wherever they entered the app.
 *
 * Mounted at the root because the alternative — populating it only in the onboarding flow, which
 * is what used to happen — meant the client forgot the user's wallet the moment they arrived any
 * other way. `/` redirects to onboarding on a missing wallet, so that was not a display bug: it
 * sent people with accounts, permissions and positions back through sign-up.
 *
 * Inside the Privy provider, for the same reason DeviceRegistration is: it keys on auth state.
 */
function WalletHydration() {
  useHydrateWallet();
  return null;
}

export default function RootLayout() {
  /*
   * Hold the splash until the typefaces are in.
   *
   * Without this the app paints one frame in the platform's fallback face and then reflows when
   * Inter arrives — every heading jumps, which on a screen full of prices reads as the numbers
   * moving. The splash is already on screen; keeping it there for the extra beat costs nothing and
   * hides the swap entirely.
   */
  const [fontsLoaded] = useFonts({
    'Inter-Regular': require('../assets/fonts/Inter-Regular.ttf'),
    'Inter-Medium': require('../assets/fonts/Inter-Medium.ttf'),
    'Inter-SemiBold': require('../assets/fonts/Inter-SemiBold.ttf'),
    'Inter-Bold': require('../assets/fonts/Inter-Bold.ttf'),
    'Inter-ExtraBold': require('../assets/fonts/Inter-ExtraBold.ttf'),
    // The display face, for the wordmark only — as the design reference uses it.
    'Baloo2-Bold': require('../assets/fonts/Baloo2-Bold.ttf'),
    'Baloo2-ExtraBold': require('../assets/fonts/Baloo2-ExtraBold.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded) void SplashScreen.hideAsync().catch(() => undefined);
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppPrivyProvider>
      <SafeAreaProvider>
        <WalletHydration />
        <DeviceRegistration />
        {/* The app is true-black by design; the OS theme never gets to change it. */}
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: 'default',
          }}
        >
          <Stack.Screen name="(onboarding)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="order/[symbol]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="auto-close/[id]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="bot/[id]/intro" options={{ presentation: 'modal' }} />
          <Stack.Screen name="bot/[id]/settings" options={{ presentation: 'modal' }} />
          <Stack.Screen name="strategy/dca" options={{ presentation: 'modal' }} />
        </Stack>
      </SafeAreaProvider>
      </AppPrivyProvider>
    </GestureHandlerRootView>
  );
}

/**
 * expo-router renders this instead of the segment when a screen throws.
 *
 * Scoped to the segment rather than the root on purpose: a failing screen inside the tabs keeps
 * the tab bar, so Safety — and the button that stops the bot — is still one tap away. A trading
 * app whose kill switch becomes unreachable because a chart threw is the worst version of this.
 */
export { ScreenError as ErrorBoundary } from '@/errors/ErrorBoundary';
