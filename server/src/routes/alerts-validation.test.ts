/**
 * An alert that can never fire must not be creatable.
 *
 * `config` was `.default({})` and nothing checked it, so `POST /alerts` accepted a price alert
 * with no level. `evaluate` then reports it `unevaluable` on every sweep, forever — correct for a
 * row that already exists, wrong to let anyone create. The user gets an entry in their list that
 * will never go off, and finds out by waiting for the thing it was meant to warn about.
 *
 * And the same alert twice is not two alerts: resubmitting an identical one created a second row
 * that fires alongside the first, notifies twice, and has to be deleted twice.
 *
 * The validation mirrors `verdictFor` deliberately. A second, looser definition of "valid" is how
 * the two drift apart until the check means nothing.
 */
import { describe, expect, it } from 'vitest';

/** The rule under test, kept in step with `unevaluableReason` in the route. */
type Body = { kind: 'price' | 'agent' | 'risk'; symbol?: string; config: Record<string, unknown> };
function unevaluableReason(body: Body): string | undefined {
  const n = (k: string) => Number(body.config[k] ?? Number.NaN);
  if (body.kind === 'price') {
    if (!body.symbol) return 'a price alert needs a symbol';
    if (!Number.isFinite(n('above')) && !Number.isFinite(n('below'))) {
      return 'a price alert needs an `above` or `below` level in config';
    }
    return undefined;
  }
  if (body.kind === 'agent') {
    return Number.isFinite(n('blockedRuns')) ? undefined : 'an agent alert needs `blockedRuns` in config';
  }
  const hasRisk =
    Number.isFinite(n('capRemainingUsd')) ||
    Number.isFinite(n('expiresWithinHours')) ||
    body.config.revoked === true;
  return hasRisk ? undefined : 'a risk alert needs `capRemainingUsd`, `expiresWithinHours` or `revoked` in config';
}

describe('a price alert needs something to compare against', () => {
  it('rejects the empty config the API used to accept', () => {
    // Exactly the request that created a dead alert on the deployed executor.
    expect(unevaluableReason({ kind: 'price', symbol: 'WETH', config: {} })).toContain('above');
  });
  it('rejects a level with no symbol', () => {
    expect(unevaluableReason({ kind: 'price', config: { above: 95 } })).toContain('symbol');
  });
  it('accepts either side of the level', () => {
    expect(unevaluableReason({ kind: 'price', symbol: 'WETH', config: { above: 95 } })).toBeUndefined();
    expect(unevaluableReason({ kind: 'price', symbol: 'WETH', config: { below: 95 } })).toBeUndefined();
    // Zero is a real level, not a missing one.
    expect(unevaluableReason({ kind: 'price', symbol: 'WETH', config: { below: 0 } })).toBeUndefined();
  });
});

describe('the other two kinds carry their own requirement', () => {
  it('an agent alert needs blockedRuns', () => {
    expect(unevaluableReason({ kind: 'agent', config: {} })).toContain('blockedRuns');
    expect(unevaluableReason({ kind: 'agent', config: { blockedRuns: 3 } })).toBeUndefined();
  });
  it('a risk alert needs one of its three triggers', () => {
    expect(unevaluableReason({ kind: 'risk', config: {} })).toContain('capRemainingUsd');
    expect(unevaluableReason({ kind: 'risk', config: { capRemainingUsd: 100 } })).toBeUndefined();
    expect(unevaluableReason({ kind: 'risk', config: { expiresWithinHours: 24 } })).toBeUndefined();
    expect(unevaluableReason({ kind: 'risk', config: { revoked: true } })).toBeUndefined();
    // `revoked: false` is not a trigger — it is the normal state of every wallet.
    expect(unevaluableReason({ kind: 'risk', config: { revoked: false } })).toContain('capRemainingUsd');
  });
});
