/**
 * Root layout. animations.md: "Screen transitions — use the platform default push/present.
 * Don't author custom ones."
 */
import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { surfaces } from '@/design/colors';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: surfaces.bg }}>
      <SafeAreaProvider>
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
    </GestureHandlerRootView>
  );
}
