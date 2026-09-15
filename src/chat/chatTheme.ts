/**
 * Which room Messages is drawn in: black, like the rest of the app, or the light lavender one (2026-09-16).
 *
 * Kept on the device, as a display preference is (`PLAN.md 3.11`), in its own small store so the app's store does not
 * carry a chat setting. Black unless someone has chosen light: everything outside the drawer is true black, and a light
 * room rising over it was the one bright surface in the app.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ChatThemeName } from './theme';

type ChatTheme = {
  theme: ChatThemeName;
  toggle: () => void;
};

export const useChatTheme = create<ChatTheme>()(
  persist(
    (set) => ({
      theme: 'black',
      toggle: () => set((s) => ({ theme: s.theme === 'black' ? 'light' : 'black' })),
    }),
    {
      name: 'xorr-chat-theme',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ theme: s.theme }),
    },
  ),
);
