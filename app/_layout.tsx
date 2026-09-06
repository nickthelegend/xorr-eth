/**
 * Root layout. animations.md: "Screen transitions — use the platform default push/present.
 * Don't author custom ones."
 */
import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppPrivyProvider } from '@/auth/PrivyProvider';
import { surfaces } from '@/design/colors';
import { useRegisterDevice } from '@/notifications/useRegisterDevice';

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

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: surfaces.bg }}>
      <AppPrivyProvider>
      <SafeAreaProvider>
        <DeviceRegistration />
        {/* The app is true-black by design; the OS theme never gets to change it. */}
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: surfaces.bg },
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
