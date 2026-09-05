/**
 * Derived values — state.md "Derived values", implemented verbatim.
 *
 * state.md: "keep the derived-value formulas exactly — they're the app's business logic and
 * several were corrected during review." Every function here is pure and unit-tested against the
 * handoff's own stated outputs in derived.test.ts.
 */
import { MINUS, money, percent, price, signedMoney } from '../format';
import type { Bar } from '../data/types';

// ── Agent controls (screen 4) ────────────────────────────────────────────────

export const RUN_FOR = ['1 Day', '3 Days', '7 Days', '30 Days'] as const;
export const RISK_LEVELS = ['Low', 'Medium', 'High'] as const;
export const CAP_MIN = 200;
export const CAP_MAX = 5000;
export const CAP_STEP = 200;

/** state.md: the caption that MUST accompany the autonomy switch. */
export function autoNote(auto: boolean): string {
  return auto
    ? 'Executes inside your limits without asking'
    : 'Every trade waits for your approval';
}

export function capLabel(cap: number): string {
  return `${money(cap, { fractionDigits: 0 })}/day`;
}

/** Marker position along the $200–$5,000 risk rail, as a 0–100 percentage. */
export function capMarkerPct(cap: number): number {
  return ((cap - CAP_MIN) / (CAP_MAX - CAP_MIN)) * 100;
}

export function runLabel(auto: boolean): string {
  return auto ? 'Run Agent' : 'Save Settings';
}

/** "Run For" as a real expiry — the pivot turns this control into the delegation's lifetime. */
export function runForMs(index: number): number {
  const days = [1, 3, 7, 30][index] ?? 1;
  return days * 24 * 60 * 60 * 1000;
}

// ── Auto Close (screen 6) ────────────────────────────────────────────────────

/** state.md: mid = 66000, size = $2500. */
export const AUTOCLOSE_MID = 66000;
export const AUTOCLOSE_SIZE = 2500;

export const TP_MIN = 0.5;
export const TP_MAX = 3.0;
export const SL_MIN = -3.0;
export const SL_MAX = -0.5;
export const TPSL_STEP = 0.5;

export function tpPrice(tp: number, mid = AUTOCLOSE_MID): number {
  return mid * (1 + tp / 100);
}
export function slPrice(sl: number, mid = AUTOCLOSE_MID): number {
  return mid * (1 + sl / 100);
}
export function tpPnl(tp: number, size = AUTOCLOSE_SIZE): number {
  return (size * tp) / 100;
}
export function slPnl(sl: number, size = AUTOCLOSE_SIZE): number {
  return Math.abs((size * sl) / 100);
}

/** state.md ruler marker positions, as percentages. */
export function tpTickPct(tp: number): number {
  return 20 + tp * 22;
}
export function slTickPct(sl: number): number {
  return 80 + sl * 22;
}

// ── Order ticket (screen 14) ─────────────────────────────────────────────────

export const SOL_REF_PRICE = 88.32;
export const ORDER_MAX_CHARS = 7;

export function orderUnits(amount: number, unitPrice = SOL_REF_PRICE): string {
  return `${(amount / unitPrice).toFixed(4)} SOL`;
}
export function orderFee(amount: number): number {
  return amount * 0.001;
}
export function orderCta(side: 'buy' | 'sell', amountStr: string, symbol = 'SOL'): string {
  return `${side === 'buy' ? 'Buy' : 'Sell'} $${amountStr} of ${symbol}`;
}

/**
 * The keypad reducer — state.md: "max 7 chars, single '.', '⌫' pops last, leading '0' replaced
 * by a digit."
 */
export function keypadPress(current: string, key: string): string {
  if (key === '⌫') {
    const next = current.slice(0, -1);
    return next === '' ? '0' : next;
  }
  if (key === '.') {
    if (current.includes('.')) return current;
    if (current.length >= ORDER_MAX_CHARS) return current;
    return `${current}.`;
  }
  // A leading '0' is replaced, not appended to — otherwise you get "0250".
  if (current === '0') return key;
  if (current.length >= ORDER_MAX_CHARS) return current;
  return `${current}${key}`;
}

// ── Leverage (screen 25) ─────────────────────────────────────────────────────

/** state.md: margin = 800, gold = 3412.10. */
export const PERP_MARGIN = 800;
export const GOLD_PRICE = 3412.1;
export const LEVERAGE_OPTIONS = [2, 5, 10] as const;

export function notional(lev: number, margin = PERP_MARGIN): number {
  return margin * lev;
}
export function liquidation(lev: number, mark = GOLD_PRICE): number {
  return mark * (1 - 0.92 / lev);
}
export function leverageWarning(lev: number): string {
  if (lev >= 10) return 'A 9% move against you wipes the margin.';
  if (lev >= 5) return 'A 18% move against you wipes the margin.';
  return 'A 46% move against you wipes the margin.';
}
export type WarnBand = 'calm' | 'warn' | 'danger';
export function leverageWarnBand(lev: number): WarnBand {
  if (lev >= 10) return 'danger';
  if (lev >= 5) return 'warn';
  return 'calm';
}

// ── Position close (screen 22) ───────────────────────────────────────────────

/** state.md: unrealised = 318.40, margin = 3800. */
export const POSITION_UNREALISED = 318.4;
export const POSITION_MARGIN = 3800;
export const CLOSE_STEPS = [25, 50, 75, 100] as const;

export function closeRealise(pct: number, unrealised = POSITION_UNREALISED): number {
  return (unrealised * pct) / 100;
}
export function closeFree(pct: number, margin = POSITION_MARGIN): number {
  return (margin * pct) / 100;
}
export function closeCta(pct: number): string {
  return pct === 100 ? 'Close position' : `Close ${pct}%`;
}

// ── Swap (screen 19) ─────────────────────────────────────────────────────────

export const SWAP_MIN = 1;
export const SWAP_MAX = 1750;
export const SWAP_STEP = 4;

export function swapOut(amount: number, unitPrice = SOL_REF_PRICE): number {
  return amount * unitPrice * 0.9975;
}
export function swapFee(amount: number, unitPrice = SOL_REF_PRICE): number {
  return amount * unitPrice * 0.0025;
}
export function swapPct(amount: number): number {
  return (amount / SWAP_MAX) * 100;
}

// ── Portfolio proposal (screen 10) ───────────────────────────────────────────

export const WEIGHT_STEP = 5;

export function weightTotal(weights: readonly number[]): number {
  return weights.reduce((a, b) => a + b, 0);
}
/** Bar widths normalise to the total, so the bar stays full while the user is mid-edit. */
export function weightBarPct(weights: readonly number[], i: number): number {
  const total = Math.max(weightTotal(weights), 1);
  return ((weights[i] ?? 0) / total) * 100;
}
export function canApprove(weights: readonly number[]): boolean {
  return weightTotal(weights) === 100;
}
export function proposalCta(weights: readonly number[], approved: boolean): string {
  if (approved) return 'Portfolio approved ✓';
  return canApprove(weights) ? 'Approve & fund' : 'Balance to 100% first';
}

// ── Onboarding ───────────────────────────────────────────────────────────────

/** Wallet setup replaced KYC after the pivot, but the 4-step progress model is unchanged. */
export function stepPct(step: number, total = 4): number {
  return (step / total) * 100;
}

export function depositFee(amount: number, feePct: number): number {
  return (amount * feePct) / 100;
}

// ── Backtest (screen 17) ─────────────────────────────────────────────────────

export const BT_CAPITAL_MIN = 1000;
export const BT_CAPITAL_MAX = 50000;
export const BT_CAPITAL_STEP = 1000;

export function btEnd(capital: number, ret: number): number {
  return capital * (1 + ret / 100);
}
export function btGain(capital: number, ret: number): number {
  return btEnd(capital, ret) - capital;
}
/** state.md: "U+2212, not a hyphen" — this was called out explicitly for Max DD. */
export function btDrawdown(dd: number): string {
  return `${MINUS}${Math.abs(dd).toFixed(1)}%`;
}

// ── Leaderboard (screen 16) ──────────────────────────────────────────────────

export type LeaderboardKey = 'pnl30d' | 'win' | 'trades';
export const LEADERBOARD_KEYS: LeaderboardKey[] = ['pnl30d', 'win', 'trades'];
export const LEADERBOARD_LABELS = ['P&L', 'Win rate', 'Volume'] as const;

export function sortLeaderboard<T extends Record<LeaderboardKey, number>>(
  rows: readonly T[],
  key: LeaderboardKey,
): T[] {
  return [...rows].sort((a, b) => b[key] - a[key]);
}
/** Bar width normalised to the largest absolute P&L in the set. */
export function leaderboardBarPct(pnlValue: number, rows: readonly { pnl30d: number }[]): number {
  const max = Math.max(...rows.map((r) => Math.abs(r.pnl30d)), 1);
  return (Math.abs(pnlValue) / max) * 100;
}

// ── Kill switch (screen 20) ──────────────────────────────────────────────────

export function killTitle(killed: boolean): string {
  return killed ? 'All agents stopped' : 'Agents are live';
}
export function killExplanation(killed: boolean, liveAgents: number): string {
  return killed
    ? 'Nothing will be placed until you resume. Open positions are untouched.'
    : `${liveAgents} agents can place orders inside your limits right now.`;
}
export function killCta(killed: boolean): string {
  return killed ? 'Resume agents' : 'Stop all agents';
}

// ── Activity (screen 15) ─────────────────────────────────────────────────────

/**
 * state.md: kindFor = [null, 'trade', 'risk', 'block'].
 *
 * [G41] The fixture carries a 5th kind, 'yield' (the "Staked 120 SOL" row), which no tab selected
 * — it appeared under All and nowhere else. Resolved by folding yield into Trades: a staking
 * action moves money and belongs with the money-moving events, and adding a 5th pill would
 * overflow the filter row at 402px.
 */
export const ACTIVITY_FILTERS = ['All', 'Trades', 'Risk', 'Blocked'] as const;

export function activityFilterKinds(index: number): readonly string[] | null {
  switch (index) {
    case 1:
      return ['trade', 'yield'];
    case 2:
      return ['risk'];
    case 3:
      return ['block'];
    default:
      return null;
  }
}

export function filterActivity<T extends { kind: string }>(rows: readonly T[], index: number): T[] {
  const kinds = activityFilterKinds(index);
  if (!kinds) return [...rows];
  return rows.filter((r) => kinds.includes(r.kind));
}

export type ActivityDot = 'acted' | 'risk' | 'blocked';
export function activityDot(kind: string): ActivityDot {
  if (kind === 'block') return 'blocked';
  if (kind === 'risk') return 'risk';
  return 'acted';
}
/** state.md: credits are `up`, debits are ink55. A debit is anything starting with U+2212. */
export function activityAmountIsCredit(amount: string): boolean {
  return amount !== '' && !amount.startsWith(MINUS);
}

// ── Chart projection helpers used by derived screens ─────────────────────────

export function barHigh(bars: readonly Bar[]): number {
  return Math.max(...bars.map((b) => b[1]));
}
export function barLow(bars: readonly Bar[]): number {
  return Math.min(...bars.map((b) => b[2]));
}
export function lastClose(bars: readonly Bar[]): number {
  return bars[bars.length - 1]![3];
}

// ── Display helpers that combine derived values with formatting ──────────────

export function autoCloseFootnote(tp: number, sl: number): { make: string; lose: string } {
  return { make: money(tpPnl(tp)), lose: money(slPnl(sl)) };
}

export function closeSummary(pct: number): { realises: string; frees: string } {
  return { realises: money(closeRealise(pct)), frees: money(closeFree(pct)) };
}

export function leverageSummary(lev: number, mark = GOLD_PRICE) {
  return {
    notional: money(notional(lev), { fractionDigits: 0 }),
    liquidation: price(liquidation(lev, mark)),
    warning: leverageWarning(lev),
    band: leverageWarnBand(lev),
  };
}

export function backtestSummary(capital: number, ret: number, dd: number) {
  return {
    end: money(btEnd(capital, ret)),
    gain: signedMoney(btGain(capital, ret)),
    ret: percent(ret),
    dd: btDrawdown(dd),
  };
}
