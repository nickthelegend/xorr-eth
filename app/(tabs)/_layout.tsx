/**
 * The tab shell — three buttons (2026-09-12).
 *
 * Home, the AI chat, and a grid, all drawn by `TabBar`. The old tabs — Markets and Assets — and the
 * chat's own route are still screens in this group, so every link and push that lands on them still
 * arrives with the bar underneath. Strategies left the group: it is a page with a back arrow now.
 *
 * The middle button raises the chat as a sheet over whatever you were looking at, and closing it
 * puts you back on that screen. `/bot` survives as a route for the pushes and links that open the
 * conversation directly, and renders the same `<Chat />` the sheet does.
 *
 * The bar lives HERE and nowhere else. A screen inside this group must not render its own — the
 * layout already draws one, and two bars stack.
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { TabBar, colors, type TabKey } from '@/ui';
import { ChatSheet } from '@/chat/ChatSheet';

const ROUTE: Record<TabKey, string> = {
  home: '/',
  more: '/more',
};

/** Which place is lit. A screen that is neither — Markets from a link, say — lights nothing. */
function activeTab(pathname: string): TabKey | null {
  if (pathname === '/') return 'home';
  if (pathname.startsWith('/more')) return 'more';
  return null;
}

export default function TabsLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const [chatOpen, setChatOpen] = useState(false);

  /*
   * The sheet is a sibling of the navigator, not a screen inside it, so it covers the tab bar as
   * well as the content. Rendering it from the `tabBar` slot would confine it to the bar's own
   * height.
   */
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Tabs
        tabBar={() => (
          <TabBar
            active={activeTab(pathname)}
            onSelect={(key) => router.navigate(ROUTE[key] as never)}
            onAction={() => setChatOpen(true)}
          />
        )}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="more" />
        <Tabs.Screen name="markets" />
        <Tabs.Screen name="holdings" />
        <Tabs.Screen name="bot" />
      </Tabs>

      <ChatSheet open={chatOpen} onClose={() => setChatOpen(false)} />
    </View>
  );
}

/**
 * expo-router renders this instead of the segment when a screen throws.
 *
 * Scoped to the segment rather than the root on purpose: a failing screen inside the tabs
 * keeps the tab bar, so the app stays navigable. A trading app that becomes a dead end because
 * a chart threw is the worst version of this.
 */
export { ScreenError as ErrorBoundary } from '@/errors/ErrorBoundary';
