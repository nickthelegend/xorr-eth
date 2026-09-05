/**
 * The store — state.md "Store", split into the slices state.md itself names.
 *
 * state.md: "The prototype holds everything in one flat store. In a real app, split it as noted."
 * Defaults are exactly the handoff's.
 *
 * Changed by the pivot:
 *   - `kyc` removed. Non-custodial means there is no KYC step; wallet setup replaced it (PLAN §7).
 *   - `wallet`, `delegation`, `strategies` added.
 */
import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CAP_MAX,
  CAP_MIN,
  CAP_STEP,
  SL_MAX,
  SL_MIN,
  SWAP_MAX,
  SWAP_MIN,
  SWAP_STEP,
  TPSL_STEP,
  TP_MAX,
  TP_MIN,
  WEIGHT_STEP,
  keypadPress,
} from './derived';
import type { Delegation, Wallet } from '../data/types';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Kill float drift on 0.5-step values: 1.0 - 0.5 - 0.5 must be exactly 0, not 1.1e-16. */
const round1 = (v: number) => Math.round(v * 10) / 10;

// ── Agent config (server-persisted per agent; PLAN §6.7 makes these the delegation policy) ──
type AgentConfigSlice = {
  auto: boolean;
  runFor: number;
  risk: number;
  cap: number;
  stocksPaused: boolean;
  setAuto: (v: boolean) => void;
  cycleRunFor: () => void;
  cycleRisk: () => void;
  bumpCap: (dir: 1 | -1) => void;
  toggleStocksPaused: () => void;
};

// ── Market UI (client-only) ──
type MarketUiSlice = {
  tab: number;
  mkt: number;
  tab5: number;
  setTab: (i: number) => void;
  setMkt: (i: number) => void;
  setTab5: (i: number) => void;
};

// ── Order params (per position) ──
type OrderSlice = {
  tp: number;
  sl: number;
  orderAmt: string;
  side: 'buy' | 'sell';
  lev: number;
  closePct: number;
  swapAmt: number;
  bumpTp: (dir: 1 | -1) => void;
  bumpSl: (dir: 1 | -1) => void;
  pressKey: (key: string) => void;
  setOrderAmt: (v: string) => void;
  setSide: (s: 'buy' | 'sell') => void;
  setLev: (l: number) => void;
  setClosePct: (p: number) => void;
  bumpSwap: (dir: 1 | -1) => void;
};

// ── Onboarding profile (server-persisted) ──
type OnboardingSlice = {
  goals: string[];
  riskQ: number;
  weights: number[];
  approved: boolean;
  walletStep: number;
  dep: number;
  method: number;
  toggleGoal: (g: string) => void;
  setRiskQ: (i: number) => void;
  bumpWeight: (i: number, delta: number) => void;
  setApproved: (v: boolean) => void;
  advanceWalletStep: () => void;
  setDep: (n: number) => void;
  setMethod: (i: number) => void;
};

// ── Agents & alerts ──
type AgentsSlice = {
  hired: Record<string, boolean>;
  alerts: Record<string, boolean>;
  decision: null | 'yes' | 'no';
  killed: boolean;
  toggleHire: (name: string) => void;
  toggleAlert: (name: string) => void;
  setDecision: (d: null | 'yes' | 'no') => void;
  setKilled: (v: boolean) => void;
};

// ── Views ──
type ViewsSlice = {
  actFilter: number;
  lbSort: number;
  btLook: number;
  btCapital: number;
  setActFilter: (i: number) => void;
  setLbSort: (i: number) => void;
  setBtLook: (i: number) => void;
  bumpBtCapital: (dir: 1 | -1) => void;
};

// ── Wallet & delegation (the pivot) ──
type WalletSlice = {
  wallet: Wallet | null;
  delegation: Delegation | null;
  setWallet: (w: Wallet | null) => void;
  setDelegation: (d: Delegation | null) => void;
};

export type Store = AgentConfigSlice &
  MarketUiSlice &
  OrderSlice &
  OnboardingSlice &
  AgentsSlice &
  ViewsSlice &
  WalletSlice;

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      // ── agent config — state.md defaults ──
      auto: true,
      runFor: 1,
      risk: 0,
      cap: 1600,
      stocksPaused: false,
      setAuto: (v) => set({ auto: v }),
      cycleRunFor: () => set((s) => ({ runFor: (s.runFor + 1) % 4 })),
      cycleRisk: () => set((s) => ({ risk: (s.risk + 1) % 3 })),
      bumpCap: (dir) => set((s) => ({ cap: clamp(s.cap + dir * CAP_STEP, CAP_MIN, CAP_MAX) })),
      toggleStocksPaused: () => set((s) => ({ stocksPaused: !s.stocksPaused })),

      // ── market UI ──
      tab: 0,
      mkt: 2, // state.md: default Commodities
      tab5: 1, // state.md: default Markets
      setTab: (i) => set({ tab: i }),
      setMkt: (i) => set({ mkt: i }),
      setTab5: (i) => set({ tab5: i }),

      // ── order params ──
      tp: 1.0,
      sl: -1.0,
      orderAmt: '250',
      side: 'buy',
      lev: 5,
      closePct: 50,
      swapAmt: 0.1,
      bumpTp: (dir) => set((s) => ({ tp: round1(clamp(s.tp + dir * TPSL_STEP, TP_MIN, TP_MAX)) })),
      bumpSl: (dir) => set((s) => ({ sl: round1(clamp(s.sl + dir * TPSL_STEP, SL_MIN, SL_MAX)) })),
      pressKey: (key) => set((s) => ({ orderAmt: keypadPress(s.orderAmt, key) })),
      setOrderAmt: (v) => set({ orderAmt: v }),
      setSide: (side) => set({ side }),
      setLev: (lev) => set({ lev }),
      setClosePct: (closePct) => set({ closePct }),
      bumpSwap: (dir) =>
        set((s) => ({ swapAmt: clamp(s.swapAmt + dir * SWAP_STEP, SWAP_MIN, SWAP_MAX) })),

      // ── onboarding ──
      goals: ['Grow long term'],
      riskQ: 1,
      weights: [55, 30, 15],
      approved: false,
      walletStep: 0,
      dep: 500,
      method: 0,
      toggleGoal: (g) =>
        set((s) => ({
          goals: s.goals.includes(g) ? s.goals.filter((x) => x !== g) : [...s.goals, g],
        })),
      setRiskQ: (riskQ) => set({ riskQ }),
      bumpWeight: (i, delta) =>
        set((s) => {
          const weights = s.weights.slice();
          weights[i] = clamp((weights[i] ?? 0) + delta * WEIGHT_STEP, 0, 100);
          // state.md: "any weight edit sets approved = false".
          return { weights, approved: false };
        }),
      setApproved: (approved) => set({ approved }),
      advanceWalletStep: () => set((s) => ({ walletStep: Math.min(4, s.walletStep + 1) })),
      setDep: (dep) => set({ dep }),
      setMethod: (method) => set({ method }),

      // ── agents & alerts ──
      hired: { 'Momentum Scout': true },
      alerts: { 'SOL above $95': true, 'NVDAx earnings': true },
      decision: null,
      killed: false,
      toggleHire: (name) => set((s) => ({ hired: { ...s.hired, [name]: !s.hired[name] } })),
      toggleAlert: (name) => set((s) => ({ alerts: { ...s.alerts, [name]: !s.alerts[name] } })),
      setDecision: (decision) => set({ decision }),
      setKilled: (killed) => set({ killed }),

      // ── views ──
      actFilter: 0,
      lbSort: 0,
      btLook: 1,
      btCapital: 5000,
      setActFilter: (actFilter) => set({ actFilter }),
      setLbSort: (lbSort) => set({ lbSort }),
      setBtLook: (btLook) => set({ btLook }),
      bumpBtCapital: (dir) =>
        set((s) => ({ btCapital: clamp(s.btCapital + dir * 1000, 1000, 50000) })),

      // ── wallet & delegation ──
      wallet: null,
      delegation: null,
      setWallet: (wallet) => set({ wallet }),
      setDelegation: (delegation) => set({ delegation }),
    }),
    {
      name: 'xorr-store',
      storage: createJSONStorage(() => AsyncStorage),
      /**
       * PLAN.md 3.11: UI prefs persist to AsyncStorage. Secrets never touch it — the wallet
       * key material lives in expo-secure-store (src/wallet), and only the PUBLIC address is
       * mirrored here so the shell can render without unlocking anything.
       */
      partialize: (s) => ({
        auto: s.auto,
        runFor: s.runFor,
        risk: s.risk,
        cap: s.cap,
        mkt: s.mkt,
        tab5: s.tab5,
        tab: s.tab,
        actFilter: s.actFilter,
        lbSort: s.lbSort,
        btLook: s.btLook,
        btCapital: s.btCapital,
        goals: s.goals,
        riskQ: s.riskQ,
        weights: s.weights,
        approved: s.approved,
        hired: s.hired,
        alerts: s.alerts,
        killed: s.killed,
        wallet: s.wallet,
      }),
    },
  ),
);

/**
 * Whether the persisted store has finished loading from AsyncStorage.
 *
 * The entry gate reads `wallet` to decide between onboarding and the tab shell. Reading it before
 * hydration makes a returning user flash the splash screen, so the gate waits for this.
 */
export function useHasHydrated(): boolean {
  // Subscribed via useSyncExternalStore rather than an effect: hydration is external state, and
  // reading it directly avoids a synchronous setState-in-effect on every mount.
  return useSyncExternalStore(
    (cb) => useStore.persist.onFinishHydration(cb),
    () => useStore.persist.hasHydrated(),
    () => false,
  );
}

/** Number of hired agents — drives "n of 4 hired" and the kill-switch explanation. */
export function hiredCount(hired: Record<string, boolean>): number {
  return Object.values(hired).filter(Boolean).length;
}

/** Number of alerts on — drives "n of 5 on". */
export function alertsOnCount(alerts: Record<string, boolean>): number {
  return Object.values(alerts).filter(Boolean).length;
}
