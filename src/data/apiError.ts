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
