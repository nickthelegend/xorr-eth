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
