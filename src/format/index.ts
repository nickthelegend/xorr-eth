/**
 * Formatting — state.md "Formatting rules". Every rule here was a real review finding in the
 * handoff; regressing one is a bug, not a nit.
 *
 *  - toLocaleString('en-US', {min/maxFractionDigits}) for any money that can exceed 999.
 *    Bare toFixed(2) drops thousands separators — found on the swap screen in review.
 *  - U+2212 (MINUS SIGN), not a hyphen, for negative numbers.
 *  - Percentages: 1dp with an explicit sign.
 *  - Crypto quantities: 4dp (SOL), 2dp for display balances.
 *  - Prices >= 1000: no decimals plus separators. Under 1000: 2dp. Sub-dollar: 4dp.
 */

/** U+2212 MINUS SIGN. Never use '-' (U+002D) in numeric output. */
export const MINUS = '−';

/** Replace any leading ASCII hyphen with U+2212. */
export function toMinus(s: string): string {
  return s.replace(/-/g, MINUS);
}

function localise(n: number, min: number, max: number): string {
  return Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  });
}

function sign(n: number, explicit: boolean): string {
  if (n < 0) return MINUS;
  return explicit ? '+' : '';
}

/**
 * Money. Always separated, never toFixed.
 * @param fractionDigits default 2 — pass 0 for whole-dollar values like the spend cap.
 */
export function money(n: number, opts: { fractionDigits?: number; explicitSign?: boolean } = {}): string {
  const { fractionDigits = 2, explicitSign = false } = opts;
  return `${sign(n, explicitSign)}$${localise(n, fractionDigits, fractionDigits)}`;
}

/**
 * A price, formatted by magnitude — state.md:
 * ">= 1000: no decimals plus separators. Under 1000: 2dp. Sub-dollar: 4dp."
 */
export function price(n: number): string {
  const a = Math.abs(n);
  if (a >= 1000) return `${sign(n, false)}$${localise(n, 0, 0)}`;
  if (a >= 1) return `${sign(n, false)}$${localise(n, 2, 2)}`;
  return `${sign(n, false)}$${localise(n, 4, 4)}`;
}

/** Percentage: 1dp with an explicit sign. `+1.0%`, `−1.0%`. */
export function percent(n: number, opts: { digits?: number; explicitSign?: boolean } = {}): string {
  const { digits = 1, explicitSign = true } = opts;
  return `${sign(n, explicitSign)}${localise(n, digits, digits)}%`;
}

/** Crypto quantity — 4dp by default (SOL), 2dp for display balances. */
export function quantity(n: number, digits = 4): string {
  return `${sign(n, false)}${localise(n, digits, digits)}`;
}

/** A signed P&L amount, e.g. `+$318.40` / `−$96.00`. */
export function signedMoney(n: number, fractionDigits = 2): string {
  return money(n, { fractionDigits, explicitSign: true });
}

/** Compact notional for stat tiles: $182.4M, $1.06B. */
export function compactMoney(n: number): string {
  const a = Math.abs(n);
  const s = sign(n, false);
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(1)}K`;
  return `${s}$${localise(a, 2, 2)}`;
}

/** A price-axis label — design.md §6: `(tHi - t*(tHi-tLo))/1000` rendered as "66.7K". */
export function axisLabel(priceValue: number): string {
  return `${(priceValue / 1000).toFixed(1)}K`;
}

/** A countdown as HH:MM:SS — screen 25's "Next funding 02:14:38". */
export function countdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

/** mm:ss — screen 12's proposal expiry "4:12". */
export function mmss(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * A settlement date relative to now — replaces the handoff's hardcoded "Tue, Sep 8" [G42].
 * Business days only, because bank transfers do not settle at weekends.
 */
export function businessDaysFromNow(days: number, now: Date = new Date()): string {
  const d = new Date(now.getTime());
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) added += 1;
  }
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
