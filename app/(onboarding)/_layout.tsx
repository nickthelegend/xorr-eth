import React from 'react';
import { Stack } from 'expo-router';
import { surfaces } from '@/design/colors';

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: surfaces.bg } }}
    />
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
