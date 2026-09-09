/**
 * That one press cannot become two records.
 *
 * Test plan item G7. The end-to-end version — double-tapping a primary action in the browser and
 * counting the rows — is the real check, and the guard underneath it had no test at all, so a
 * regression would have been invisible until it created somebody two identical alerts. Which is
 * exactly what it did once: see the note in `Button.tsx` about "Alert me when WETH is above $9000".
 */
import { describe, expect, it } from 'vitest';
import { DOUBLE_TAP_MS, createPressGuard } from './pressGuard';

describe('createPressGuard', () => {
  it('lets the first press through', () => {
    expect(createPressGuard().take()).toBe(true);
  });

  it('drops every press while one is in flight', () => {
    const g = createPressGuard();
    expect(g.take()).toBe(true);
    // The case that matters: dispatched in the same tick, before any state could update.
    expect(g.take()).toBe(false);
    expect(g.take()).toBe(false);
  });

  it('lets the next press through once released', () => {
    const g = createPressGuard();
    g.take();
    g.release();
    expect(g.take()).toBe(true);
  });

  it('reports whether it is held, so the loading effect can clear it', () => {
    const g = createPressGuard();
    expect(g.held).toBe(false);
    g.take();
    expect(g.held).toBe(true);
    g.release();
    expect(g.held).toBe(false);
  });

  it('is safe to release when nothing is held', () => {
    const g = createPressGuard();
    g.release();
    expect(g.take()).toBe(true);
  });

  it('gives each button its own lock', () => {
    // Two guards must not interfere — one busy screen cannot wedge another screen's button.
    const a = createPressGuard();
    const b = createPressGuard();
    a.take();
    expect(b.take()).toBe(true);
  });

  it('holds long enough to swallow a double tap, and not long enough to be felt', () => {
    // A synchronous handler has no promise to await, so the lock is released on a timer instead.
    // 800ms is well past a double tap (~300ms) and under the ~1s that reads as an unresponsive UI.
    expect(DOUBLE_TAP_MS).toBeGreaterThan(300);
    expect(DOUBLE_TAP_MS).toBeLessThanOrEqual(1000);
  });
});
