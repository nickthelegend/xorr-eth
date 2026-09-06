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

export { API_BASE };

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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

export const api = {
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T,>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: <T,>(path: string) => request<T>(path, { method: 'DELETE' }),
  async getText(path: string): Promise<string> {
    if (!isPublicPath(path) && authKnowledge() === 'signed-out') throw new NotSignedIn(path);
    const res = await fetch(`${API_BASE}${path}`, { headers: await authHeaders() });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.text();
  },
};
