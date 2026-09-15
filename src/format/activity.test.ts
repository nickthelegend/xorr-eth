/**
 * The main screens say what the bot did, not where it settled; the trail keeps both.
 */
import { describe, expect, it } from 'vitest';
import { plainAction } from './activity';

describe('an activity line on a main screen', () => {
  it('says what the bot did, without the venue it settled on', () => {
    expect(plainAction("Bought 0.0020 WETH against a maker's SwapVM program")).toBe('Bought 0.0020 WETH');
    expect(plainAction('Bought 0.0020 WETH against a maker’s SwapVM program')).toBe('Bought 0.0020 WETH');
    expect(plainAction('Sold 0.0040 WETH on an Aqua book')).toBe('Sold 0.0040 WETH');
    expect(plainAction('Bought 0.0565 WETH through 1inch Aqua')).toBe('Bought 0.0565 WETH');
    expect(plainAction('Supplied $100 USDC to Aave')).toBe('Supplied $100 USDC to savings');
  });

  it('leaves every other line as it was written', () => {
    for (const line of [
      'Bought 0.0079 WETH',
      'Sold 50% of WETH',
      'Trading permission granted',
      'Withdrawal address added',
      'Transfer out refused',
      'Hired Yield Keeper',
    ]) {
      expect(plainAction(line)).toBe(line);
    }
  });
});
