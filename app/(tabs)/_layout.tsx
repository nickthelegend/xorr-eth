/**
 * The tab shell — design.md §4, retargeted by PLAN.md §3.5.
 *
 * Four tabs and a chat button. Agents was the centre TAB, on the reasoning that supervision is what
 * distinguishes this app; that is still true, but supervision is a conversation you open, not a
 * list you navigate to. So the middle of the bar is now a raised button that brings the chat up
 * over whatever you were looking at, and closing it puts you back on that screen.
 *
 * `/bot` survives as a route — it is where the `proposal-awaiting` push lands and where the
 * briefing's button goes — and renders the same `<Chat />` the sheet does.
 *
 * The bar lives HERE and nowhere else. A screen inside this group must not render its own
 * — the layout already draws one, and two bars stack.
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { TabBar, colors, type TabKey } from '@/ui';
import { ChatSheet } from '@/chat/ChatSheet';
import { useStore } from '@/state/store';

const ROUTE: Record<TabKey, string> = {
  home: '/',
  markets: '/markets',
  trade: '/strategies',
  assets: '/holdings',
};

function activeTab(pathname: string): TabKey | null {
  if (pathname.startsWith('/markets')) return 'markets';
  if (pathname.startsWith('/strategies')) return 'trade';
  if (pathname.startsWith('/holdings')) return 'assets';
  // `/bot` is inside this group but is not one of the four, so no tab is lit for it.
  if (pathname.startsWith('/bot')) return null;
  return 'home';
}

export default function TabsLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const killed = useStore((s) => s.killed);
  const [chatOpen, setChatOpen] = useState(false);

  /*
   * The sheet is a sibling of the navigator, not a screen inside it, so it covers the tab bar as
   * well as the content. Rendering it from the `tabBar` slot would have confined it to the bar's
   * own 80-odd points.
   */
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Tabs
        tabBar={() => (
          <TabBar
            active={activeTab(pathname)}
            agentsLive={!killed}
            onSelect={(key) => router.navigate(ROUTE[key] as never)}
            onChat={() => setChatOpen(true)}
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

      <ChatSheet open={chatOpen} onClose={() => setChatOpen(false)} />
    </View>
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
