/**
 * The 5-tab shell — design.md §4, retargeted by PLAN.md §3.5.
 * The custom TabBar renders the exact icon/label/dot spec; expo-router's default bar is hidden.
 */
import React from 'react';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { TABS, TabBar } from '@/design/components/TabBar';
import { surfaces } from '@/design/colors';
import { useStore } from '@/state/store';

export default function TabsLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const killed = useStore((s) => s.killed);

  const active =
    TABS.find((t) => t.key !== 'index' && pathname.startsWith(`/${t.key}`))?.key ?? 'index';

  return (
    <Tabs
      tabBar={() => (
        <TabBar
          active={active}
          live={!killed}
          onSelect={(key) => router.navigate(key === 'index' ? '/' : (`/${key}` as never))}
        />
      )}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: surfaces.bg } }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="markets" />
      <Tabs.Screen name="bot" />
      <Tabs.Screen name="strategies" />
      <Tabs.Screen name="holdings" />
    </Tabs>
  );
}
