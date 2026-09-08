/**
 * Real logos for a list of symbols, from `/market/logos`.
 *
 * Cached for the session because logos do not move and the server resolves them against two
 * rate-limited upstreams. A screen that mounts, unmounts and remounts — every tab switch — should
 * not cost a round trip, let alone two upstream lookups per row.
 *
 * A symbol the server cannot resolve comes back `null`, and `AssetMark` keeps its gradient for it.
 * That is deliberate: the commodities, indices and pre-IPO names have no issuer and no token, so
 * there is no logo to show and inventing one would put a false identity on an instrument.
 */
import { useEffect, useMemo, useState } from 'react';
import { api } from './api';

type LogoResponse = Record<string, { url: string | null }>;

/** Session cache, shared across every screen that asks. */
const cache = new Map<string, string | null>();
const inflight = new Map<string, Promise<void>>();

async function load(symbols: string[]): Promise<void> {
  const missing = symbols.filter((s) => !cache.has(s));
  if (missing.length === 0) return;

  const key = missing.slice().sort().join(',');
  const pending = inflight.get(key);
  if (pending) return pending;

  const run = (async () => {
    try {
      const res = await api.get<LogoResponse>(
        `/market/logos?symbols=${encodeURIComponent(missing.join(','))}`,
      );
      /*
       * Only what the server actually decided about.
       *
       * A symbol it could not resolve inside its deadline is ABSENT from the response, not null —
       * and caching those as null was the same mistake as the catch below, one layer up: a
       * CoinGecko rate limit during the first Markets load would have left every crypto row
       * wearing a gradient until the app restarted.
       */
      for (const s of missing) {
        const entry = res[s];
        if (entry) cache.set(s, entry.url);
      }
    } catch {
      /*
       * A failed lookup is not "this symbol has no logo".
       *
       * Caching null here would make one bad request permanent for the session and leave every
       * row wearing a gradient until the app restarts. Left uncached, so the next screen that
       * asks tries again — and the gradient renders in the meantime either way.
       */
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, run);
  return run;
}

/** `{ [symbol]: url | null }`. Absent keys simply have not resolved yet. */
export function useLogos(symbols: readonly string[]): Record<string, string | null> {
  const key = useMemo(() => [...new Set(symbols)].sort().join(','), [symbols]);
  /* Only to re-render once the load lands; the map itself is read straight from the cache. */
  const [, bump] = useState(0);

  useEffect(() => {
    if (!key) return;
    let alive = true;
    void load(key.split(',')).then(() => {
      if (alive) bump((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, [key]);

  /*
   * Rebuilt every render, deliberately.
   *
   * This was memoised on `[key]`, and `key` does not change when the fetch lands — so the load
   * completed, the state bumped, the component re-rendered, and `useMemo` handed back the same
   * empty object it had built before the request went out. Lists kept their gradients until
   * something else remounted them, which is why it looked right on the asset screen (a fresh mount
   * every visit) and did nothing at all on Markets (a tab, mounted once and kept).
   *
   * Sixty lookups against a Map is not worth memoising, and a version counter in the dependency
   * array would only be lying to the compiler about what this reads.
   */
  const out: Record<string, string | null> = {};
  for (const s of key ? key.split(',') : []) {
    const hit = cache.get(s);
    if (hit !== undefined) out[s] = hit;
  }
  return out;
}

/** One symbol, for the screens that show a single asset. */
export function useLogo(symbol: string | undefined): string | null {
  const symbols = useMemo(() => (symbol ? [symbol] : []), [symbol]);
  const logos = useLogos(symbols);
  return symbol ? (logos[symbol] ?? null) : null;
}
