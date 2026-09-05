/**
 * Fixture integrity — PLAN.md 3.4 (G4) and 3.6 (G12).
 */
import { describe, expect, it } from 'vitest';
import { assetClasses } from './fixtures/markets';
import { activityFixtures } from './fixtures/activity';
import { watchlistGroups, btcBars, areaSeries } from './fixtures/series';
import { backtestFixtures } from './fixtures/backtest';
import { agentFixtures } from './fixtures/agents';
import { MINUS } from '../format';

describe('3.4 instrument counts reconcile [G4]', () => {
  it('has 5 classes of 9 instruments = 45, matching the docs', () => {
    expect(assetClasses).toHaveLength(5);
    for (const c of assetClasses) {
      expect(c.instruments, `${c.id}`).toHaveLength(9);
    }
    const total = assetClasses.reduce((a, c) => a + c.instruments.length, 0);
    expect(total).toBe(45);
  });

  it('the 9th pre-IPO instrument exists — the handoff shipped 8 while claiming 9', () => {
    const preipo = assetClasses.find((c) => c.id === 'preipo');
    expect(preipo?.instruments.map((i) => i.sym)).toContain('CANVA');
  });

  it('every instrument carries its gradient stops and a class id', () => {
    for (const c of assetClasses) {
      for (const i of c.instruments) {
        expect(i.c1, `${i.sym}`).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(i.c2, `${i.sym}`).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(i.classId).toBe(c.id);
      }
    }
  });
});

describe('3.6 no hyphen-minus in any numeric field [G12]', () => {
  const hyphenInNumber = /-(?=[\d.])/;

  it('market instrument prices and changes use U+2212', () => {
    for (const c of assetClasses) {
      for (const i of c.instruments) {
        expect(i.px, `${i.sym} px`).not.toMatch(hyphenInNumber);
        expect(i.chg, `${i.sym} chg`).not.toMatch(hyphenInNumber);
        if (!i.up) expect(i.chg, `${i.sym} down`).toContain(MINUS);
      }
    }
  });

  it('watchlist rows use U+2212 — the prototype mixed hyphens here', () => {
    for (const g of watchlistGroups) {
      for (const r of g.rows) {
        expect(r.chg, `${r.sym}`).not.toMatch(hyphenInNumber);
      }
    }
  });

  it('activity amounts and details use U+2212', () => {
    for (const a of activityFixtures) {
      expect(a.amount, a.action).not.toMatch(hyphenInNumber);
      expect(a.detail, a.action).not.toMatch(hyphenInNumber);
    }
  });
});

describe('3.10 series that were trapped inside the prototype [G5][G6][G7]', () => {
  it('sparklines exist as data for all 5 watchlist groups', () => {
    expect(watchlistGroups).toHaveLength(5);
    const rows = watchlistGroups.flatMap((g) => g.rows);
    expect(rows).toHaveLength(11);
    for (const r of rows) {
      // 90x30 viewBox — design.md §6 "Sparkline".
      const pts = r.spark.split(' ').map((p) => p.split(',').map(Number));
      expect(pts.length).toBeGreaterThanOrEqual(6);
      for (const [x, y] of pts) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(90);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(30);
      }
    }
  });

  it('equity curves exist as data for all 4 lookbacks', () => {
    expect(backtestFixtures).toHaveLength(4);
    for (const b of backtestFixtures) {
      expect(b.curve, b.lookback).toBeTruthy();
      const pts = b.curve.split(' ').map((p) => p.split(',').map(Number));
      // 360x110 viewBox — design.md §6 "Area / equity curve".
      for (const [x, y] of pts) {
        expect(x).toBeLessThanOrEqual(360);
        expect(y).toBeLessThanOrEqual(110);
      }
      // A positive return must end higher (lower y) than it started.
      const first = pts[0]![1]!;
      const last = pts[pts.length - 1]![1]!;
      expect(b.ret > 0 ? last < first : last > first, b.lookback).toBe(true);
    }
  });

  it('area-chart geometry exists as data for screens 13 and 25', () => {
    expect(areaSeries.SOL).toBeTruthy();
    expect(areaSeries.XAUT).toBeTruthy();
  });

  it('the 12 BTC/USD bars are intact and well-formed OHLC', () => {
    expect(btcBars).toHaveLength(12);
    for (const [o, h, l, c] of btcBars) {
      expect(h).toBeGreaterThanOrEqual(Math.max(o, c));
      expect(l).toBeLessThanOrEqual(Math.min(o, c));
    }
    expect(btcBars[11]![3]).toBe(66560); // the "last close" every screen quotes
  });
});

describe('feed labelling — PLAN.md §1.3 item 8', () => {
  it('every instrument declares whether a real feed backs it', () => {
    for (const c of assetClasses) {
      for (const i of c.instruments) {
        expect(['live', 'simulated']).toContain(i.feed);
      }
    }
  });

  it('agents carry the leaderboard inputs', () => {
    expect(agentFixtures).toHaveLength(4);
    expect(agentFixtures.map((a) => a.pnl30d)).toEqual([842, 1204, 318, -96]);
  });
});
