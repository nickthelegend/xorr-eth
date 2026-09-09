/**
 * What a user is shown when a request fails, and whether they are invited to repeat it.
 *
 * Both of these were found on screen rather than in a test: /oracle/WETH rendered
 * `404 Not Found: {"error":"WETH is not a tokenized equity"}` — the raw wire body, braces and all
 * — under a "Try again" button for a fact that will never change.
 */
import { describe, expect, it } from 'vitest';
import { ApiError, NotSignedIn, TimedOut, absentOrThrow, errorText, isRetryable } from './apiError';

const wire = (status: number, body: unknown, text = JSON.stringify(body)) =>
  new ApiError(status, `${status} Not Found: ${text}`, body);

describe('errorText', () => {
  it('prefers the sentence the server wrote over the wire form', () => {
    const e = wire(404, { error: 'WETH is not a tokenized equity' });
    expect(errorText(e)).toBe('WETH is not a tokenized equity');
    // The raw form is still on the error for logs — it is only kept off the screen.
    expect(e.message).toContain('{"error"');
  });

  it('prefers `message` over `error` when the body carries both', () => {
    expect(errorText(wire(409, { error: 'cap_spent', message: 'The daily cap is spent.' }))).toBe(
      'The daily cap is spent.',
    );
  });

  it('never renders braces when the body has no prose', () => {
    expect(errorText(wire(500, { detail: { nested: true } }))).toBe('The executor answered 500.');
  });

  it('leaves the errors that write their own sentence alone', () => {
    expect(errorText(new TimedOut('/orders', 20_000))).toContain('did not answer within 20s');
    expect(errorText(new NotSignedIn('/wallet/balance'))).toContain('Not signed in');
  });

  it('has something to say about a value that is not an Error at all', () => {
    expect(errorText(undefined)).toBe('Something went wrong.');
    expect(errorText(new Error(''))).toBe('Something went wrong.');
  });
});

describe('isRetryable', () => {
  it('does not invite a retry of a request the server has already refused on its merits', () => {
    expect(isRetryable(wire(404, { error: 'not a tokenized equity' }))).toBe(false);
    expect(isRetryable(wire(400, { error: 'bad symbol' }))).toBe(false);
    expect(isRetryable(wire(409, { error: 'cap_spent' }))).toBe(false);
  });

  it('does invite one where the server said "not now"', () => {
    expect(isRetryable(wire(408, {}))).toBe(true);
    expect(isRetryable(wire(429, {}))).toBe(true);
  });

  it('does invite one when the failure was the server or the transport', () => {
    expect(isRetryable(wire(500, {}))).toBe(true);
    expect(isRetryable(wire(503, {}))).toBe(true);
    expect(isRetryable(new TimedOut('/orders', 20_000))).toBe(true);
    expect(isRetryable(new Error('Network request failed'))).toBe(true);
  });
});

/*
 * A read that failed is not a thing that is absent.
 *
 * `repos.wallet.delegation()` returned `null` on any failure — the same value the route returns
 * for a wallet that has granted nothing — so `/safety` announced "No permission has been granted"
 * with a live $1,600/day grant on chain and the executor merely unreachable.
 */
describe('absentOrThrow', () => {
  it('passes a value straight through', async () => {
    await expect(absentOrThrow(async () => ({ cap: 1600 }))).resolves.toEqual({ cap: 1600 });
  });

  it('treats a genuine null as an absence', async () => {
    await expect(absentOrThrow(async () => null)).resolves.toBeNull();
    await expect(absentOrThrow(async () => undefined)).resolves.toBeNull();
  });

  it('treats being signed out as an absence, because it is one', async () => {
    await expect(
      absentOrThrow(async () => {
        throw new NotSignedIn('/delegation');
      }),
    ).resolves.toBeNull();
  });

  it('rethrows a transport failure instead of calling it an absence', async () => {
    let threw: unknown;
    try {
      await absentOrThrow(async () => {
        throw new TypeError('Failed to fetch');
      });
    } catch (e) {
      threw = e;
    }
    expect(threw).toBeInstanceOf(TypeError);
  });

  it('rethrows a server error instead of calling it an absence', async () => {
    let threw: unknown;
    try {
      await absentOrThrow(async () => {
        throw new ApiError(500, 'boom', '/delegation');
      });
    } catch (e) {
      threw = e;
    }
    expect(threw).toBeInstanceOf(ApiError);
  });
});
