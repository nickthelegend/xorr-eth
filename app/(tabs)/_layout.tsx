/**
 * The 5-tab shell — design.md §4, retargeted by PLAN.md §3.5.
 *
 * The bar comes from `src/ui`: the exact §4 icon paths, a 9.5/600 label, and the Agents
 * status dot wired to the kill switch. expo-router's default bar is hidden.
 *
 * The bar lives HERE and nowhere else. A screen inside this group must not render its own
 * — the layout already draws one, and two bars stack.
 */
import React from 'react';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { TabBar, colors, type TabKey } from '@/ui';
import { useStore } from '@/state/store';

/** design.md §4 order: Agents sits centre because supervision is what distinguishes this app. */
const ROUTE: Record<TabKey, string> = {
  home: '/',
  markets: '/markets',
  agents: '/bot',
  trade: '/strategies',
  assets: '/holdings',
};

function activeTab(pathname: string): TabKey {
  if (pathname.startsWith('/markets')) return 'markets';
  if (pathname.startsWith('/bot')) return 'agents';
  if (pathname.startsWith('/strategies')) return 'trade';
  if (pathname.startsWith('/holdings')) return 'assets';
  return 'home';
}

export default function TabsLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const killed = useStore((s) => s.killed);

  return (
    <Tabs
      tabBar={() => (
        <TabBar
          active={activeTab(pathname)}
          agentsLive={!killed}
          onSelect={(key) => router.navigate(ROUTE[key] as never)}
        />
      )}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="markets" />
      <Tabs.Screen name="bot" />
      <Tabs.Screen name="strategies" />
      <Tabs.Screen name="holdings" />
    </Tabs>
  );
}

/**
 * expo-router renders this instead of the segment when a screen throws.
 *
 * Scoped to the segment rather than the root on purpose: a failing screen inside the tabs
 * keeps the tab bar, so Safety — and the button that stops the bot — is still one tap away.
 * A trading app whose kill switch becomes unreachable because a chart threw is the worst
 * version of this.
 */
export { ScreenError as ErrorBoundary } from '@/errors/ErrorBoundary';
