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
      for (const s of missing) cache.set(s, res[s]?.url ?? null);
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

  return useMemo(() => {
    const out: Record<string, string | null> = {};
    for (const s of key ? key.split(',') : []) {
      const hit = cache.get(s);
      if (hit !== undefined) out[s] = hit;
    }
    return out;
  }, [key]);
}

/** One symbol, for the screens that show a single asset. */
export function useLogo(symbol: string | undefined): string | null {
  const symbols = useMemo(() => (symbol ? [symbol] : []), [symbol]);
  const logos = useLogos(symbols);
  return symbol ? (logos[symbol] ?? null) : null;
}
