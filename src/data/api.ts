/**
 * The executor API client. The ONLY place in the client that talks to our own server.
 *
 * Base URL comes from EXPO_PUBLIC_API_URL so a device build can point at a deployed executor;
 * it defaults to the local dev server.
 */
import { accessToken } from '@/auth/token';
import { isPublicPath } from './publicPaths';
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
   * Do not ask a question we already know we cannot answer.
   *
   * Every authenticated call was fired regardless of whether a token existed, so a signed-out load
   * of the home screen produced a 401 for `/wallet/balance`, `/agents` and `/positions` — three
   * real console errors and three wasted round trips, on the first screen a new user sees.
   */
  if (!isPublicPath(path) && !(await accessToken())) {
    throw new NotSignedIn(path);
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
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${body ? `: ${body}` : ''}`);
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
    if (!isPublicPath(path) && !(await accessToken())) throw new NotSignedIn(path);
    const res = await fetch(`${API_BASE}${path}`, { headers: await authHeaders() });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.text();
  },
};
