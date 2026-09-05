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

/**
 * One lane per upstream host.
 *
 * A single global queue meant a CoinGecko backlog — and the public tier backs up readily — stalled
 * every 1inch call behind it, so a single slow feed could take a quote from 300ms to half a
 * minute. Rate limits are per host, so the spacing belongs per host too.
 */
type Lane = { queue: Promise<unknown>; lastRequestAt: number };
const lanes = new Map<string, Lane>();

function laneFor(url: string): Lane {
  const host = new URL(url).host;
  let lane = lanes.get(host);
  if (!lane) {
    lane = { queue: Promise.resolve(), lastRequestAt: 0 };
    lanes.set(host, lane);
  }
  return lane;
}

const cache = new Map<string, { at: number; value: unknown }>();
/** In-flight requests, so N callers for the same URL make one call rather than N queued ones. */
const inflight = new Map<string, Promise<unknown>>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function rawGet<T>(url: string, timeoutMs: number, headers: Record<string, string> = {}): Promise<T> {
  const lane = laneFor(url);
  let lastStatus = 0;
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const wait = MIN_SPACING_MS - (Date.now() - lane.lastRequestAt);
    if (wait > 0) await sleep(wait);
    lane.lastRequestAt = Date.now();

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
    } catch (e) {
      // A timeout or a dropped connection is the same kind of failure as a 503 — the upstream is
      // busy — and deserves the same backoff. Previously it escaped the loop on the first attempt,
      // so a single slow response failed the whole call while a 503 got four more tries.
      const transient =
        e instanceof Error &&
        (e.name === 'AbortError' ||
          e.name === 'TimeoutError' ||
          /aborted|fetch failed|ECONNRESET|ETIMEDOUT|socket hang up/i.test(e.message));
      if (!transient || attempt === MAX_ATTEMPTS) throw e;
      lastError = e;
      await sleep(800 * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  if (lastError) throw lastError;
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

  // Two callers wanting the same URL at the same moment should cost one request, not two queue
  // slots. This is what keeps a page that mounts three components off the rate limiter.
  const pending = inflight.get(url);
  if (pending) return pending as Promise<T>;

  const lane = laneFor(url);
  const run = lane.queue.then(() => rawGet<T>(url, timeoutMs, headers));
  lane.queue = run.catch(() => undefined);

  const tracked = run.then(
    (value) => {
      cache.set(url, { at: Date.now(), value });
      inflight.delete(url);
      return value;
    },
    (e: unknown) => {
      inflight.delete(url);
      throw e;
    },
  );
  inflight.set(url, tracked);
  return tracked;
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
  inflight.clear();
}
