/**
 * Thread state — PLAN.md 6.2. The handoff designed screen 12 as a single-exchange snapshot [G43];
 * as the centre tab it needs a real thread: persistence, scrollback, unread state, and the
 * proposal's expiry actually expiring.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { fact, voice, type Segment, type ThreadMessage } from './message';
import type { Proposal } from '../data/types';

const KEY = 'xorr-thread-v1';
const PAGE = 30;

let seq = 0;
const nextId = () => `m${Date.now().toString(36)}-${(seq++).toString(36)}`;

export type ThreadStore = {
  messages: ThreadMessage[];
  proposal: Proposal | null;
  decided: null | 'approve' | 'skip';
  unread: number;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  append: (m: ThreadMessage) => void;
  setProposal: (p: Proposal | null) => void;
  setDecided: (d: null | 'approve' | 'skip') => void;
  markRead: () => void;
  /** Oldest-first page for scrollback. */
  page: (n: number) => ThreadMessage[];
};

export const useThread = create<ThreadStore>((set, get) => ({
  messages: [],
  proposal: null,
  decided: null,
  unread: 0,
  hydrated: false,

  async hydrate() {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw) set({ messages: JSON.parse(raw) as ThreadMessage[] });
    } catch {
      // A corrupt thread must not brick the tab; start clean rather than crash.
    } finally {
      set({ hydrated: true });
    }
  },

  append(m) {
    set((s) => {
      const messages = [...s.messages, m];
      void AsyncStorage.setItem(KEY, JSON.stringify(messages.slice(-200))).catch(() => undefined);
      return { messages, unread: m.author === 'bot' ? s.unread + 1 : s.unread };
    });
  },

  setProposal: (proposal) => set({ proposal, decided: null }),
  setDecided: (decided) => set({ decided }),
  markRead: () => set({ unread: 0 }),
  page: (n) => {
    const all = get().messages;
    return all.slice(Math.max(0, all.length - n * PAGE));
  },
}));

// ── Message builders. Every number goes through fact(); every quip through voice(). ──

export function botProse(agent: string, segments: Segment[]): ThreadMessage {
  return { id: nextId(), at: Date.now(), author: 'bot', type: 'prose', agent, segments };
}

export function userMessage(text: string): ThreadMessage {
  return { id: nextId(), at: Date.now(), author: 'user', type: 'user', text };
}

export function proposalMessage(proposalId: string): ThreadMessage {
  return { id: nextId(), at: Date.now(), author: 'bot', type: 'proposal', proposalId };
}

export function fillMessage(agent: string, units: number, at: number, stop: number): ThreadMessage {
  return {
    id: nextId(),
    at: Date.now(),
    author: 'bot',
    type: 'fill',
    agent,
    outcome: 'filled',
    segments: [
      voice('Filled.'),
      fact(units, 'quantity', 'fill'),
      voice('SOL at'),
      fact(at, 'price', 'fill'),
      voice('. Stop is set at'),
      fact(stop, 'price', 'order'),
      voice('.'),
    ],
  };
}

export function declinedMessage(agent: string, symbol: string): ThreadMessage {
  return {
    id: nextId(),
    at: Date.now(),
    author: 'bot',
    type: 'declined',
    agent,
    segments: [voice(`Skipped. I will not re-propose ${symbol} today.`)],
  };
}

export function expiredMessage(): ThreadMessage {
  return {
    id: nextId(),
    at: Date.now(),
    author: 'system',
    type: 'expired',
    segments: [voice('That proposal expired before you decided. I did not place it.')],
  };
}

export function dcaReceipt(
  agent: string,
  usd: number,
  units: number,
  symbol: string,
  signature?: string,
): ThreadMessage {
  return {
    id: nextId(),
    at: Date.now(),
    author: 'bot',
    type: 'dca-receipt',
    agent,
    signature,
    segments: [
      voice('Your recurring buy ran.'),
      fact(usd, 'money', 'schedule'),
      voice(`into ${symbol},`),
      fact(units, 'quantity', 'fill'),
      voice('filled.'),
    ],
  };
}

export function blockedMessage(agent: string, reason: string, segments: Segment[]): ThreadMessage {
  return { id: nextId(), at: Date.now(), author: 'bot', type: 'blocked', agent, reason, segments };
}

export function strategyCreated(agent: string, strategyId: string, segments: Segment[]): ThreadMessage {
  return {
    id: nextId(),
    at: Date.now(),
    author: 'bot',
    type: 'strategy-created',
    agent,
    strategyId,
    segments,
  };
}

/** Day dividers — screens.md shows a date divider at the head of the thread. */
export function dayKey(at: number): string {
  return new Date(at).toDateString();
}

export function withDividers(messages: ThreadMessage[]): (ThreadMessage | { divider: string })[] {
  const out: (ThreadMessage | { divider: string })[] = [];
  let last = '';
  for (const m of messages) {
    const k = dayKey(m.at);
    if (k !== last) {
      out.push({ divider: formatDivider(m.at) });
      last = k;
    }
    out.push(m);
  }
  return out;
}

function formatDivider(at: number): string {
  const d = new Date(at);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
