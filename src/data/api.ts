/**
 * The executor API client. The ONLY place in the client that talks to our own server.
 *
 * Base URL comes from EXPO_PUBLIC_API_URL so a device build can point at a deployed executor;
 * it defaults to the local dev server.
 */
import { accessToken } from '@/auth/token';
import { isPublicPath } from './publicPaths';
import { authKnowledge, whenAuthKnown } from '@/auth/authState';
import { API_BASE } from './apiBase';
import { ApiError } from './apiError';

export { API_BASE };
export { ApiError, apiReason } from './apiError';

/**
 * Every request carries the Privy access token. The executor rejects anything without one, so a
 * missing token is a bug worth surfacing rather than a request worth sending.
 */
async function authHeaders(): Promise<Record<string, string>> {
  const token = await accessToken();
  return token ? { authorization: `Bearer ${token}` } : {};
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
 * Reads are bounded tighter than writes because they are retried by simply looking again.
 *
 * Both are generous on purpose. This executor settles on a mainnet fork, and its slow calls are
 * genuinely slow: `/positions` has been measured at 31s cold and a swap has to quote, build,
 * simulate, broadcast and wait for a receipt. A bound that fires on a call that would have
 * succeeded turns a slow product into a broken one, which is the worse trade.
 */
const READ_TIMEOUT_MS = 45_000;
/*
 * Deliberately above the slowest write this executor has actually produced — a `POST /orders`
 * measured at 153s while 1inch's lane was congested. A write that gives up EARLIER than the server
 * answers is worse than no bound at all: the trade may well have executed, and a screen that says
 * "did not answer" invites a retry that spends twice. Hence the ceiling, and hence the wording of
 * the error, which never claims nothing happened.
 */
const WRITE_TIMEOUT_MS = 180_000;

/**
 * Run `op` under a deadline, aborting the in-flight fetch when it passes.
 *
 * The deadline covers the WHOLE operation, not just the fetch: `whenAuthKnown()` and the Privy
 * token both sit in front of the request and either can stall, and a hang there looks identical
 * from the screen.
 */
async function withDeadline<T>(
  path: string,
  ms: number,
  op: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort();
      reject(new TimedOut(path, ms));
    }, ms);
  });
  try {
    return await Promise.race([op(ctrl.signal), expired]);
  } catch (e) {
    // An abort we caused is the deadline, not a network fault, and it must read as one.
    if (e instanceof Error && e.name === 'AbortError') throw new TimedOut(path, ms);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const timeoutMs = init?.method && init.method !== 'GET' ? WRITE_TIMEOUT_MS : READ_TIMEOUT_MS;
  return withDeadline(path, timeoutMs, (signal) => send<T>(path, signal, init));
}

async function send<T>(path: string, signal: AbortSignal, init?: RequestInit): Promise<T> {
  /*
   * Do not ask a question we KNOW we cannot answer — and only then.
   *
   * Every authenticated call used to fire regardless of whether a token existed, so a signed-out
   * load of the home screen produced a 401 for `/wallet/balance`, `/agents` and `/positions`:
   * three real console errors on the first screen a new user sees.
   *
   * The first version of this skipped whenever `accessToken()` was falsy, which was a worse bug:
   * on a freshly established session the token is briefly unavailable, so reads fired in that
   * window were dropped silently and the screen kept its empty state for good. While the answer is
   * unknown the request goes out — a 401 is visible and recoverable; silence is neither.
   */
  if (!isPublicPath(path)) {
    // While the answer is unknown, wait for it rather than sending a request that cannot carry a
    // token. See `whenAuthKnown` for why an un-retried 401 was worse than a short wait.
    const know = authKnowledge() === 'unknown' ? await whenAuthKnown() : authKnowledge();
    if (know === 'signed-out') throw new NotSignedIn(path);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    signal,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(await authHeaders()),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // A refusal often carries a REASON — the policy engine's own sentence, the one the user
    // should read. Parse it here so a caller does not have to re-parse an error message.
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = undefined;
    }
    throw new ApiError(res.status, `${res.status} ${res.statusText}${text ? `: ${text}` : ''}`, parsed);
  }
  return (await res.json()) as T;
}


export const api = {
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T,>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: <T,>(path: string) => request<T>(path, { method: 'DELETE' }),
  async getText(path: string): Promise<string> {
    if (!isPublicPath(path) && authKnowledge() === 'signed-out') throw new NotSignedIn(path);
    return withDeadline(path, READ_TIMEOUT_MS, async (signal) => {
      const res = await fetch(`${API_BASE}${path}`, { signal, headers: await authHeaders() });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.text();
    });
  },
};

