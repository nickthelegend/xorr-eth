/**
 * The executor API client. The ONLY place in the client that talks to our own server.
 *
 * Base URL comes from EXPO_PUBLIC_API_URL so a device build can point at a deployed executor;
 * it defaults to the local dev server.
 */
import { accessToken } from '@/auth/token';
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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
  async getText(path: string): Promise<string> {
    const res = await fetch(`${API_BASE}${path}`, { headers: await authHeaders() });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.text();
  },
};
