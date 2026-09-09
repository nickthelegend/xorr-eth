/**
 * What a refusal actually said, kept away from anything that needs a runtime.
 *
 * These two live apart from `api.ts` because they are pure and `api.ts` is not: it reaches
 * `expo-application` through the auth headers, which pulls in `expo-modules-core` and its
 * `__DEV__` global. Importing that into a unit test fails before a single assertion runs, so the
 * one piece worth testing was the one piece that could not be.
 */
/**
 * An HTTP answer we did not want, with the body attached.
 *
 * A 409 from `/orders` is not a transport failure — it is the policy engine saying no, in a
 * sentence written for the user. Losing that to `new Error('409 Conflict')` meant the screen
 * had to show a status code where it could have shown "the daily cap is spent".
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * The server's own sentence, when it wrote one.
 *
 * Routes answer a refusal as `{ error, message }` or `{ error }` — the policy engine's wording,
 * the venue's reason, "No route for USDC -> WETH". Screens were rendering their own generic
 * substitute over the top of it: "No route available" where the executor had said which pair and
 * why. A stated reason is the difference between a user retrying pointlessly and a user knowing
 * to change something.
 *
 * Falls back to undefined rather than to the raw message, so a caller can choose its own wording
 * when there is genuinely nothing to report — an HTTP status is not a sentence.
 */
export function apiReason(e: unknown): string | undefined {
  if (!(e instanceof ApiError)) return undefined;
  const body = e.body as { message?: unknown; error?: unknown } | undefined;
  const reason = typeof body?.message === 'string' ? body.message : body?.error;
  if (typeof reason !== 'string' || !reason.trim()) return undefined;
  // `no_route` and `insufficient_liquidity` are identifiers, not prose. Left alone deliberately:
  // a screen that shows one is a screen we should give a sentence to, and hiding it here would
  // make that invisible.
  return reason.trim();
}

/**
 * The sentence to put in front of a user, out of whatever the failure carried.
 *
 * `ApiError.message` keeps the raw wire form on purpose — `404 Not Found: {"error":"WETH is not a
 * tokenized equity"}` — because throwing information away at the boundary is how a screen ends up
 * with a status code and nothing else. But `ErrorState` was rendering exactly that string, so the
 * raw body, the braces and the quotes went on screen: /oracle/WETH showed the JSON verbatim.
 *
 * The server already wrote the sentence. Prefer it; fall back to the status when the body carried
 * no prose, and leave non-HTTP errors alone — `TimedOut` and `NotSignedIn` write their own.
 */
export function errorText(e: unknown): string {
  const reason = apiReason(e);
  if (reason) return reason;
  if (e instanceof ApiError) {
    // No prose in the body. A bare status is not a sentence either, so say what happened in one.
    return `The executor answered ${e.status}.`;
  }
  return e instanceof Error && e.message ? e.message : 'Something went wrong.';
}

/**
 * Is trying the identical request again worth offering?
 *
 * A "Try again" button under a permanent refusal is a worse failure than no button: it invites a
 * user to keep pressing something that will answer the same way forever. /oracle/WETH offered a
 * retry on "WETH is not a tokenized equity", which is not going to change.
 *
 * 4xx means the request was wrong, so repeating it unchanged gets the same answer — except 408 and
 * 429, which are explicitly "not now, try later". Everything else (5xx, timeouts, transport) is
 * worth another go.
 */
export function isRetryable(e: unknown): boolean {
  if (!(e instanceof ApiError)) return true;
  if (e.status === 408 || e.status === 429) return true;
  return e.status < 400 || e.status >= 500;
}

/**
 * Thrown instead of sending a request that is certain to be rejected.
 *
 * Screens already treat a failed read as "no data", which is the right rendering for a signed-out
 * user — the difference is that they now get there without three 401s in the console and three
 * pointless round trips.
 */
export class NotSignedIn extends Error {
  constructor(path: string) {
    super(`Not signed in, so ${path} was not requested.`);
    this.name = 'NotSignedIn';
  }
}

/**
 * The executor did not answer in time.
 *
 * Nothing in this client was bounded, and `fetch` on its own never gives up. A single request the
 * server never finished — a `POST /orders` whose swap wedged upstream — left the order ticket
 * spinning on its green button with no error, no timeout and no way back: the only exit was to
 * kill the app. Found by placing a real order on a simulator and watching it never return.
 *
 * A bound is not a fix for a slow server. It is the difference between a state the user can act on
 * and one they cannot leave.
 */
export class TimedOut extends Error {
  constructor(
    readonly path: string,
    readonly ms: number,
  ) {
    // Never "it failed". A request that timed out may still be running on the server, and for a
    // trade the difference between those two sentences is a double spend.
    super(
      `The executor did not answer within ${Math.round(ms / 1000)}s. ` +
        'It may still be working — check Activity before trying again.',
    );
    this.name = 'TimedOut';
  }
}

/**
 * Read something that may legitimately be absent, without turning a FAILURE into an absence.
 *
 * `repos.wallet.delegation()` was written as
 *
 *     (await api.get('/delegation').catch(() => undefined)) ?? null
 *
 * so an unreachable executor produced `null` — the same value the route returns for a wallet that
 * has granted nothing. `/safety` reads exactly that to choose between LIVE and NOT GRANTED, and
 * with the executor down and a live $1,600/day grant on chain it announced "No permission has been
 * granted, so nothing can trade."
 *
 * `useHydrateDelegation` already had a catch for this case, commented "A failed read is not 'no
 * permission'", which could never fire against a function that never threw.
 *
 * `NotSignedIn` is the one error that IS an absence: no session means no permission, which is an
 * answer rather than a failure to get one. Everything else propagates so the caller can say it
 * could not find out.
 *
 * Extracted here for the same reason `errorText` and `pressGuard` were: the part worth testing was
 * the part a test could not reach, because `local.ts` pulls in the whole Expo runtime.
 */
export async function absentOrThrow<T>(read: () => Promise<T | null | undefined>): Promise<T | null> {
  try {
    return (await read()) ?? null;
  } catch (e) {
    if (e instanceof NotSignedIn) return null;
    throw e;
  }
}
