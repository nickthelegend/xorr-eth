import { describe, expect, it } from 'vitest';
import {
  MINUS,
  axisLabel,
  businessDaysFromNow,
  compactMoney,
  countdown,
  mmss,
  money,
  percent,
  price,
  quantity,
  signedMoney,
  toMinus,
} from './index';

describe('3.5 formatting rules — state.md', () => {
  it('money uses thousands separators, never bare toFixed', () => {
    // The exact review finding: toFixed on a 4-figure number drops the separator.
    expect(money(4862.18)).toBe('$4,862.18');
    expect(money(1059.84)).toBe('$1,059.84');
    expect((1059.84).toFixed(2)).toBe('1059.84'); // what the bug looked like
    expect(money(63.28)).toBe('$63.28');
  });

  it('negatives use U+2212, never a hyphen', () => {
    expect(MINUS).toBe('−');
    expect(money(-370.02)).toBe(`${MINUS}$370.02`);
    expect(money(-370.02)).not.toContain('-');
    expect(percent(-14.6)).toBe(`${MINUS}14.6%`);
    expect(toMinus('-1.2%')).toBe(`${MINUS}1.2%`);
  });

  it('prices format by magnitude', () => {
    expect(price(66560)).toBe('$66,560'); // >= 1000: no decimals + separators
    expect(price(3412.1)).toBe('$3,412'); // ditto
    expect(price(88.32)).toBe('$88.32'); // < 1000: 2dp
    expect(price(0.1842)).toBe('$0.1842'); // sub-dollar: 4dp
  });

  it('percentages carry an explicit sign at 1dp', () => {
    expect(percent(1)).toBe('+1.0%');
    expect(percent(-1)).toBe(`${MINUS}1.0%`);
    expect(percent(2.4)).toBe('+2.4%');
    expect(percent(0.67, { digits: 2 })).toBe('+0.67%');
  });

  it('crypto quantities are 4dp', () => {
    expect(quantity(12.4)).toBe('12.4000');
    expect(quantity(1750.3, 2)).toBe('1,750.30');
    // The order-ticket conversion: amount / 88.32 to 4dp.
    expect(quantity(250 / 88.32)).toBe('2.8306');
  });

  it('signed money for P&L', () => {
    expect(signedMoney(318.4)).toBe('+$318.40');
    expect(signedMoney(-96)).toBe(`${MINUS}$96.00`);
    expect(signedMoney(1204)).toBe('+$1,204.00');
  });

  it('compact notional for stat tiles', () => {
    expect(compactMoney(182_400_000)).toBe('$182.4M');
    expect(compactMoney(1_060_000_000)).toBe('$1.06B');
  });

  it('axis labels derive from the projection, in K', () => {
    expect(axisLabel(66740)).toBe('66.7K');
    expect(axisLabel(65060)).toBe('65.1K');
  });

  it('countdowns', () => {
    expect(countdown(8078)).toBe('02:14:38'); // screen 25 "Next funding"
    expect(mmss(252)).toBe('4:12'); // screen 12 "expires 4:12"
    expect(mmss(0)).toBe('0:00');
    expect(mmss(-5)).toBe('0:00');
  });

  it('settlement dates are relative, not the hardcoded "Tue, Sep 8" [G42]', () => {
    // Friday 2026-09-04 + 2 business days = Tuesday 2026-09-08.
    const friday = new Date('2026-09-04T12:00:00Z');
    expect(businessDaysFromNow(2, friday)).toBe('Tue, Sep 8');
    // and it moves with the calendar, which the hardcoded string could not.
    const monday = new Date('2026-09-07T12:00:00Z');
    expect(businessDaysFromNow(2, monday)).toBe('Wed, Sep 9');
  });
});
