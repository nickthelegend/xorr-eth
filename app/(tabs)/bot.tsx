/**
 * Screen 12 — Bot chat, as a route.
 *
 * The conversation itself now lives in `src/chat/Chat.tsx`, because the tab-bar button opens the
 * same thing as a sheet and an approve-before-execute flow must not exist twice.
 *
 * This route is no longer a tab, but it is not dead: `routeFor('proposal-awaiting')` returns
 * `/bot`, so a push about a waiting proposal lands here, and the morning briefing's button pushes
 * it too. Both are deep links, and a deep link needs somewhere to arrive.
 */
import React from 'react';
import { Screen } from '@/ui';
import { Chat } from '@/chat/Chat';

export default function BotChat() {
  return (
    <Screen tabBar gutter="none">
      <Chat />
    </Screen>
  );
}
