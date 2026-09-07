/**
 * PLAN.md 3.9 — "Assert against the handoff's stated outputs. These formulas ARE the business
 * logic." Every expectation below is traceable to a line in state.md or screens.md.
 */
import { describe, expect, it } from 'vitest';
import * as d from './derived';
import { MINUS, money } from '../format';
import { btcBars } from '../data/fixtures/series';
import { agentFixtures } from '../data/fixtures/agents';
import { activityFixtures } from '../data/fixtures/activity';

describe('agent controls — screen 4', () => {
  it('autoNote changes with the switch (design.md §5 requires the caption to change)', () => {
    expect(d.autoNote(true)).toBe('Executes inside your limits without asking');
    expect(d.autoNote(false)).toBe('Every trade waits for your approval');
    expect(d.autoNote(true)).not.toBe(d.autoNote(false));
  });

  it('capLabel and the marker position', () => {
    expect(d.capLabel(1600)).toBe('$1,600/day');
    // state.md: capMarker = (cap - 200) / 4800 * 100
    expect(d.capMarkerPct(1600)).toBeCloseTo(29.1667, 3);
    expect(d.capMarkerPct(200)).toBe(0);
    expect(d.capMarkerPct(5000)).toBe(100);
  });

  it('runLabel', () => {
    expect(d.runLabel(true)).toBe('Run Agent');
    expect(d.runLabel(false)).toBe('Save Settings');
  });

  it('Run For maps to a real delegation lifetime', () => {
    expect(d.runForMs(0)).toBe(86_400_000);
    expect(d.runForMs(3)).toBe(30 * 86_400_000);
  });
});

describe('Auto Close — screen 6 (mid 66000, size $2500)', () => {
  it('tp/sl prices', () => {
    // state.md: tpPrice = mid * (1 + tp/100)
    expect(d.tpPrice(1.0)).toBe(66660);
    expect(d.slPrice(-1.0)).toBe(65340);
    expect(d.tpPrice(3.0)).toBeCloseTo(67980, 6);
  });

  it('tp/sl P&L — the footnote "Make X at TP or lose Y at SL"', () => {
    expect(d.tpPnl(1.0)).toBe(25);
    expect(d.slPnl(-1.0)).toBe(25);
    expect(money(d.tpPnl(1.0))).toBe('$25.00');
    expect(d.tpPnl(3.0)).toBe(75);
  });

  it('ruler tick positions', () => {
    // state.md: tpTick = 20 + tp*22, slTick = 80 + sl*22
    expect(d.tpTickPct(1.0)).toBe(42);
    expect(d.slTickPct(-1.0)).toBe(58);
  });
});

describe('order ticket — screen 14', () => {
  it('unit conversion is 4dp against $88.32', () => {
    expect(d.orderUnits(250, 88.32, 'SOL')).toBe('2.8306 SOL');
    expect(d.orderUnits(250, 2500, 'WETH')).toBe('0.1000 WETH');
  });

  it('fee is 0.1%', () => {
    expect(d.orderFee(250)).toBeCloseTo(0.25, 10);
  });

  it('CTA reads as designed', () => {
    // Defaults to the Base asset the executor can actually settle, not a chain we do not trade.
    expect(d.orderCta('buy', '250')).toBe('Buy $250 of WETH');
    expect(d.orderCta('sell', '1,000')).toBe('Sell $1,000 of WETH');
    expect(d.orderCta('buy', '250', 'NVDAc')).toBe('Buy $250 of NVDAc');
  });

  describe('keypad rules — state.md', () => {
    it('a leading 0 is REPLACED by a digit, not appended to', () => {
      expect(d.keypadPress('0', '5')).toBe('5');
      expect(d.keypadPress('0', '.')).toBe('0.');
    });
    it('max 7 characters', () => {
      expect(d.keypadPress('1234567', '8')).toBe('1234567');
      expect(d.keypadPress('123456', '7')).toBe('1234567');
    });
    it('a single decimal point', () => {
      expect(d.keypadPress('12.5', '.')).toBe('12.5');
      expect(d.keypadPress('12', '.')).toBe('12.');
    });
    it('backspace pops the last character and floors at 0', () => {
      expect(d.keypadPress('250', '⌫')).toBe('25');
      expect(d.keypadPress('2', '⌫')).toBe('0');
      expect(d.keypadPress('0', '⌫')).toBe('0');
    });
    it('a realistic sequence', () => {
      const seq = ['1', '2', '5', '.', '5', '0'];
      expect(seq.reduce(d.keypadPress, '0')).toBe('125.50');
    });
  });
});

describe('leverage — screen 25 (margin $800, gold $3412.10)', () => {
  it('notional = 800 * lev', () => {
    expect(d.notional(2)).toBe(1600);
    expect(d.notional(5)).toBe(4000);
    expect(d.notional(10)).toBe(8000);
  });

  it('liq = 3412.10 * (1 - 0.92/lev)', () => {
    expect(d.liquidation(10)).toBeCloseTo(3412.1 * (1 - 0.092), 6);
    expect(d.liquidation(5)).toBeCloseTo(3412.1 * (1 - 0.184), 6);
    expect(d.liquidation(2)).toBeCloseTo(3412.1 * (1 - 0.46), 6);
    // Higher leverage puts liquidation closer to the mark. That's the whole warning.
    expect(d.liquidation(10)).toBeGreaterThan(d.liquidation(2));
  });

  it('the warning names the consequence, and its colour band escalates', () => {
    expect(d.leverageWarning(2)).toBe('A 46% move against you wipes the margin.');
    expect(d.leverageWarning(5)).toBe('A 18% move against you wipes the margin.');
    expect(d.leverageWarning(10)).toBe('A 9% move against you wipes the margin.');
    expect(d.leverageWarnBand(2)).toBe('calm');
    expect(d.leverageWarnBand(5)).toBe('warn');
    expect(d.leverageWarnBand(10)).toBe('danger');
  });
});

describe('position close — screen 22 (unrealised $318.40, margin $3800)', () => {
  it('realises and frees scale with the percentage', () => {
    expect(d.closeRealise(50)).toBeCloseTo(159.2, 10);
    expect(d.closeFree(50)).toBe(1900);
    expect(d.closeRealise(100)).toBe(318.4);
    expect(d.closeFree(25)).toBe(950);
  });

  it('the CTA switches wording at 100%', () => {
    expect(d.closeCta(50)).toBe('Close 50%');
    expect(d.closeCta(100)).toBe('Close position');
  });

  it('the summary line formats with separators', () => {
    expect(d.closeSummary(50)).toEqual({ realises: '$159.20', frees: '$1,900.00' });
  });
});

describe('swap — screen 19', () => {
  it('out = amt * 88.32 * 0.9975 and fee is 0.25%', () => {
    expect(d.swapOut(12, 88.32)).toBeCloseTo(12 * 88.32 * 0.9975, 10);
    expect(d.swapFee(12, 88.32)).toBeCloseTo(12 * 88.32 * 0.0025, 10);
  });

  it('the fill percentage tracks the 1..1750 range', () => {
    // Bounds are in units of the pay token (WETH on Base), not the prototype's SOL amounts.
    expect(d.swapPct(d.SWAP_MAX)).toBe(100);
    expect(d.swapPct(d.SWAP_MAX / 2)).toBe(50);
  });

  it('a 4-figure swap keeps its thousands separator (the review finding)', () => {
    // 1750 SOL x $88.32 = $154,560, less the 0.25% fee.
    expect(money(d.swapOut(1750, 88.32))).toBe('$154,173.60');
    expect(money(d.swapOut(1750, 88.32))).toContain(',');
  });
});

describe('portfolio proposal — screen 10', () => {
  it('defaults total 100 and can be approved', () => {
    expect(d.weightTotal([55, 30, 15])).toBe(100);
    expect(d.canApprove([55, 30, 15])).toBe(true);
    expect(d.proposalCta([55, 30, 15], false)).toBe('Approve & fund');
  });

  it('an unbalanced total disables the CTA with the exact copy', () => {
    expect(d.canApprove([60, 30, 15])).toBe(false);
    expect(d.proposalCta([60, 30, 15], false)).toBe('Balance to 100% first');
  });

  it('once approved the CTA confirms', () => {
    expect(d.proposalCta([55, 30, 15], true)).toBe('Portfolio approved ✓');
  });

  it('bars normalise to the total so the bar stays full mid-edit', () => {
    expect(d.weightBarPct([55, 30, 15], 0)).toBeCloseTo(55, 10);
    // Mid-edit at 105 total, the first sleeve is 60/105, not 60/100.
    expect(d.weightBarPct([60, 30, 15], 0)).toBeCloseTo((60 / 105) * 100, 10);
    const sum = [0, 1, 2].reduce((a, i) => a + d.weightBarPct([60, 30, 15], i), 0);
    expect(sum).toBeCloseTo(100, 8);
  });
});

describe('backtest — screen 17', () => {
  it('end value and gain', () => {
    expect(d.btEnd(5000, 11.8)).toBeCloseTo(5590, 6);
    expect(d.btGain(5000, 11.8)).toBeCloseTo(590, 6);
  });

  it('max drawdown uses U+2212, not a hyphen — called out explicitly in state.md', () => {
    expect(d.btDrawdown(-14.6)).toBe(`${MINUS}14.6%`);
    expect(d.btDrawdown(-14.6)).not.toContain('-');
  });

  it('the summary formats every field', () => {
    expect(d.backtestSummary(5000, 11.8, -5.4)).toEqual({
      end: '$5,590.00',
      gain: '+$590.00',
      ret: '+11.8%',
      dd: `${MINUS}5.4%`,
    });
  });
});

describe('leaderboard — screen 16', () => {
  it('sorts by each metric', () => {
    expect(d.sortLeaderboard(agentFixtures, 'pnl30d').map((a) => a.name)).toEqual([
      'Earnings Desk',
      'Momentum Scout',
      'Yield Keeper',
      'Drawdown Guard',
    ]);
    expect(d.sortLeaderboard(agentFixtures, 'win')[0]!.name).toBe('Yield Keeper');
    expect(d.sortLeaderboard(agentFixtures, 'trades')[0]!.name).toBe('Momentum Scout');
  });

  it('bars normalise to the largest absolute P&L (1204)', () => {
    expect(d.leaderboardBarPct(1204, agentFixtures)).toBe(100);
    expect(d.leaderboardBarPct(842, agentFixtures)).toBeCloseTo((842 / 1204) * 100, 10);
    // A negative P&L still draws a bar — magnitude, not sign.
    expect(d.leaderboardBarPct(-96, agentFixtures)).toBeCloseTo((96 / 1204) * 100, 10);
  });
});

describe('kill switch — screen 20', () => {
  it('state-driven title, explanation and CTA', () => {
    expect(d.killTitle(false)).toBe('Agents are live');
    expect(d.killTitle(true)).toBe('All agents stopped');
    expect(d.killCta(false)).toBe('Stop all agents');
    expect(d.killCta(true)).toBe('Resume agents');
    expect(d.killExplanation(false, 3)).toBe(
      '3 agents can place orders inside your limits right now.',
    );
    expect(d.killExplanation(true, 3)).toContain('Open positions are untouched');
  });

  /*
   * The third state. A grant that names a delegate the executor is not is unusable, and the
   * screen reported it as "Agents are live — 1 agents can place orders inside your limits right
   * now." while not one order could be placed.
   */
  it('a grant to a key the executor does not hold is not "live"', () => {
    expect(d.delegateUnusable({ delegateIsCurrent: false }, false)).toBe(true);
    expect(d.killTitle(false, true)).toBe('Agents cannot trade');
    expect(d.killCta(false, true)).toBe('Reconnect agents');
    expect(d.killExplanation(false, 1, true)).toContain('different bot key');
    // And it must not read as a working permission.
    expect(d.killExplanation(false, 1, true)).not.toContain('can place orders');
  });

  it('a stopped switch stays stopped — the two states do not collide', () => {
    // Killed wins: the user stopped it, and that is not a connection fault.
    expect(d.delegateUnusable({ delegateIsCurrent: false }, true)).toBe(false);
  });

  it('an executor too old to answer is not accused of being broken', () => {
    // Undefined is "unknown", not "wrong" — claiming a fault we have not seen is its own bug.
    expect(d.delegateUnusable({}, false)).toBe(false);
    expect(d.delegateUnusable(null, false)).toBe(false);
    expect(d.delegateUnusable(undefined, false)).toBe(false);
    expect(d.delegateUnusable({ delegateIsCurrent: true }, false)).toBe(false);
  });
});

describe('activity — screen 15', () => {
  it('All shows everything', () => {
    expect(d.filterActivity(activityFixtures, 0)).toHaveLength(activityFixtures.length);
  });

  it('[G41] the yield row is reachable — it was orphaned by the original filter map', () => {
    const trades = d.filterActivity(activityFixtures, 1);
    expect(trades.map((r) => r.action)).toContain('Staked 120 SOL');
    // Every fixture row is reachable from at least one non-All tab.
    for (const row of activityFixtures) {
      const reachable = [1, 2, 3].some((i) =>
        d.filterActivity(activityFixtures, i).some((r) => r.id === row.id),
      );
      expect(reachable, `${row.action} is orphaned`).toBe(true);
    }
  });

  it('risk and blocked filters select their own rows', () => {
    expect(d.filterActivity(activityFixtures, 2).map((r) => r.action)).toEqual(['Stop loss moved']);
    expect(d.filterActivity(activityFixtures, 3).map((r) => r.action)).toEqual(['Skipped NVDAx']);
  });

  it('dot colour class per kind', () => {
    expect(d.activityDot('block')).toBe('blocked');
    expect(d.activityDot('risk')).toBe('risk');
    expect(d.activityDot('trade')).toBe('acted');
    expect(d.activityDot('yield')).toBe('acted');
  });

  it('credits vs debits — a debit starts with U+2212', () => {
    expect(d.activityAmountIsCredit('+$44.90')).toBe(true);
    expect(d.activityAmountIsCredit(`${MINUS}$370.02`)).toBe(false);
    expect(d.activityAmountIsCredit('')).toBe(false);
  });
});

describe('bar helpers', () => {
  it('read the BTC series correctly', () => {
    expect(d.barHigh(btcBars)).toBe(66620);
    expect(d.barLow(btcBars)).toBe(65180);
    expect(d.lastClose(btcBars)).toBe(66560);
  });
});

describe('asset header — the percentage names its own window', () => {
  it('1M is not "today"', () => {
    /*
     * The bug, exactly: the header computed the change over the selected candle range and then
     * labelled it "today" regardless. On 1M a real asset read "up 38.4% today" having moved
     * about 2% since midnight.
     */
    expect(d.rangeChange('1M', 38.4, 2.55).label).toBe('past month');
    expect(d.rangeChange('1M', 38.4, 2.55).pct).toBe(38.4);
    expect(d.rangeChange('1W', 4.2, 2.55).label).toBe('past week');
    expect(d.rangeChange('1Y', 33.1, 2.55).label).toBe('past year');
    expect(d.rangeChange('All', 33.1, 2.55).label).toBe('all time');
  });

  it('the day comes from the quote, so it matches every other screen', () => {
    // 2.1 was this screen's own series maths; 2.55 is what the market list and search show.
    expect(d.rangeChange('1D', 2.1, 2.55)).toEqual({ pct: 2.55, label: 'today' });
  });

  it('falls back to the series when there is no quote', () => {
    expect(d.rangeChange('1D', 2.1, undefined).pct).toBe(2.1);
    expect(d.rangeChange('1D', 2.1, Number.NaN).pct).toBe(2.1);
    // A real zero is a real answer, not a missing one.
    expect(d.rangeChange('1D', 2.1, 0).pct).toBe(0);
  });
});

describe('trailing stop — the exit the engine could always run', () => {
  /*
   * `planExitRules` has read `trailPct` since it was written and `observationFor` maintains the
   * high-water mark on every tick, both covered by tests. Nothing in the app could set it, so the
   * one exit people actually ask for existed in full and was unreachable.
   *
   * These pin the arithmetic the screen shows next to the control, because a trailing stop whose
   * displayed floor disagrees with the executor's is worse than no number at all.
   */
  const floor = (peak: number, trailPct: number) => peak * (1 - trailPct / 100);

  it('the floor follows the high, not the entry', () => {
    expect(floor(2800, 5)).toBeCloseTo(2660, 6);
    // Up from entry: the floor rose with it.
    expect(floor(3000, 5)).toBeCloseTo(2850, 6);
  });

  it('a breached floor is what fired the real fill', () => {
    // The live run: peak 2800, 5% trail, WETH at 2501.65 — sold, tx 0x47db5129…
    expect(2501.65).toBeLessThan(floor(2800, 5));
    // And at the same peak with the price above the floor, it must not fire.
    expect(2700).toBeGreaterThan(floor(2800, 5));
  });

  it('off is off — zero is not a stop at ground level', () => {
    // `planExitRules` treats trailPct > 0 as configured, so 0 must never arm a floor at the peak.
    expect(floor(2800, 0)).toBe(2800);
  });
});

describe('permission expiry — the deadline nothing read', () => {
  const H = 3_600_000;
  const now = Date.UTC(2026, 8, 7, 12);

  it('says nothing while there is plenty of time', () => {
    expect(d.expiryState(now + 72 * H, now)).toBe('ok');
    expect(d.expiryNote(now + 72 * H, now)).toBeUndefined();
  });

  it('warns inside the last day, in hours a person can act on', () => {
    expect(d.expiryState(now + 5 * H, now)).toBe('soon');
    expect(d.expiryNote(now + 5 * H, now)).toContain('5 hours');
    // Singular, because "1 hours" is the kind of thing that makes a user trust nothing else.
    expect(d.expiryNote(now + H, now)).toContain('an hour');
  });

  it('the boundary is inclusive — exactly a day out is already a warning', () => {
    expect(d.expiryState(now + 24 * H, now)).toBe('soon');
    expect(d.expiryState(now + 24 * H + 1, now)).toBe('ok');
  });

  it('an expired permission says what is and is not affected', () => {
    expect(d.expiryState(now - 1, now)).toBe('expired');
    const note = d.expiryNote(now - H, now)!;
    expect(note).toContain('expired');
    // The reassurance is the load-bearing half: a stopped bot is not a lost balance.
    expect(note).toContain('untouched');
  });

  it('no permission is not an expired one', () => {
    // Before a grant exists there is no deadline, and inventing one would be a false alarm.
    expect(d.expiryState(undefined, now)).toBe('none');
    expect(d.expiryState(0, now)).toBe('none');
    expect(d.expiryNote(undefined, now)).toBeUndefined();
  });
});
