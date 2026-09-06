/**
 * The one way a screen reads a repository. Returns explicit loading/error state so every screen
 * can render the states PLAN.md 10.11 requires — and so no screen is tempted to call fetch.
 *
 * animations.md bans entrance animations and staggered reveals, so a loading state is a static
 * placeholder that swaps instantly. No shimmer.
 *
 * `loading` is DERIVED, not set. Writing setLoading(true) at the top of an effect triggers a
 * cascading render on every dependency change; comparing the settled key against the current one
 * gives the same answer for free.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type AsyncState<T> = {
  data: T | undefined;
  loading: boolean;
  error: Error | undefined;
  reload: () => void;
  /**
   * `Date.now()` at the moment this data settled, or `undefined` before the first answer.
   *
   * Screens that report "when did I last hear from the executor" — the briefing header, a
   * price staleness note — need the fetch time, and stamping it in a screen-level effect
   * means setting state from an effect on every load. The hook already knows; it just
   * never said.
   */
  settledAt: number | undefined;
};

type Settled<T> = { key: string; at?: number; data?: T; error?: Error };

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [nonce, setNonce] = useState(0);
  const [settled, setSettled] = useState<Settled<T>>({ key: '' });
  const alive = useRef(true);

  const key = useMemo(() => JSON.stringify([deps, nonce]), [deps, nonce]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    let current = true;
    fn()
      .then((data) => {
        if (current && alive.current) setSettled({ key, data, at: Date.now() });
      })
      .catch((e: unknown) => {
        if (current && alive.current) {
          setSettled({
            key,
            at: Date.now(),
            error: e instanceof Error ? e : new Error(String(e)),
          });
        }
      });
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // Keep showing the previous data while a new key is in flight — a list that empties on every
  // filter change reads as a bug, and animations.md forbids covering it with a transition.
  return {
    data: settled.data,
    error: settled.key === key ? settled.error : undefined,
    loading: settled.key !== key,
    reload,
    settledAt: settled.at,
  };
}
