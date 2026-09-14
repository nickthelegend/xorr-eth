/**
 * Whether the Messages drawer is up, and which conversation it shows.
 *
 * One drawer, mounted once at the root (`app/_layout.tsx`), opened from wherever the agents are asked for: the tab bar's
 * Messages button, and the `/bot` route that pushes and the briefing link to. It opens on the list of conversations, or
 * straight into one agent's. State rather than a route, because the drawer rises over the screen you are on instead of
 * replacing it.
 */
import { create } from 'zustand';

type ChatDrawerState = {
  open: boolean;
  /** The agent whose conversation is showing, or null for the list. */
  agent: string | null;
  /** Raise the drawer, on the list or on one agent's conversation. */
  show: (agent?: string | null) => void;
  hide: () => void;
  openConversation: (agent: string) => void;
  showList: () => void;
};

export const useChatDrawer = create<ChatDrawerState>((set) => ({
  open: false,
  agent: null,
  show: (agent = null) => set({ open: true, agent }),
  hide: () => set({ open: false }),
  openConversation: (agent) => set({ agent }),
  showList: () => set({ agent: null }),
}));
