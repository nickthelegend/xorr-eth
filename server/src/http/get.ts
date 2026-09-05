/**
 * Resilient JSON GET for the executor.
 *
 * The public price tiers rate-limit hard (HTTP 429). A trading server that drops a scheduled buy
 * because a chart refreshed somewhere else is worse than one that waits a second, so this layer:
 *   - serialises outbound requests with a minimum spacing,
 *   - caches for a short TTL,
 *   - retries 429 and 5xx with exponential backoff, honouring Retry-After.
 *
 * The client has the same protection in src/data/marketData.ts. Both halves need it: the app
 * refreshing a chart and the executor pricing a fill hit the same upstream quota.
 */
const MIN_SPACING_MS = Number(process.env.HTTP_MIN_SPACING_MS ?? 1_100);
const MAX_ATTEMPTS = 5;

let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;
const cache = new Map<string, { at: number; value: unknown }>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function rawGet<T>(url: string, timeoutMs: number, headers: Record<string, string> = {}): Promise<T> {
  let lastStatus = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const wait = MIN_SPACING_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { accept: 'application/json', ...headers },
      });
      lastStatus = res.status;
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get('retry-after'));
        const backoff =
          Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 800 * 2 ** attempt;
        if (attempt === MAX_ATTEMPTS) break;
        await sleep(backoff);
        continue;
      }
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`${lastStatus} after ${MAX_ATTEMPTS} attempts: ${url}`);
}

export async function getJson<T>(
  url: string,
  ttlMs = 30_000,
  timeoutMs = 15_000,
  headers: Record<string, string> = {},
): Promise<T> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;

  const run = queue.then(() => rawGet<T>(url, timeoutMs, headers));
  queue = run.catch(() => undefined);
  const value = await run;
  cache.set(url, { at: Date.now(), value });
  return value;
}

/**
 * Last-known-good fallback for a scheduled run.
 *
 * If the upstream is down after every retry, a stale price is better than a missed buy — but only
 * within a bounded window, and the caller is told the value is stale so it can be labelled.
 */
export function staleValue<T>(url: string, maxAgeMs: number): T | undefined {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.value as T;
  return undefined;
}

export function clearHttpCache(): void {
  cache.clear();
}
