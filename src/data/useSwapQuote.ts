/**
 * A real swap quote — PLAN.md 12.16.
 *
 * Screen 19's "Best of 3 venues" was a fixed string. This asks the aggregator and reports what it
 * actually routed through, what the minimum received is at the user's slippage, and the real
 * price impact. Debounced, because the amount stepper fires on every tap.
 */
import { useEffect, useState } from 'react';
import { api } from './api';

export type SwapQuoteResult = {
  outAmount: number;
  minimumOut: number;
  priceImpactPct: number;
  slippageBps: number;
  venues: string[];
  route: string;
};

export function useSwapQuote(inSymbol: string, outSymbol: string, amount: number) {
  const key = `${inSymbol}:${outSymbol}:${amount}`;
  // `loading` is DERIVED by comparing the settled key against the current one, the same way
  // useAsync does it. Setting a loading flag in the effect body cascades a render on every tap
  // of the amount stepper.
  const [settled, setSettled] = useState<{ key: string; data?: SwapQuoteResult; error?: Error }>({
    key: '',
  });

  useEffect(() => {
    // A zero amount is handled in the RETURN value, not by writing state here — an early
    // setSettled would be exactly the synchronous effect-body write we are avoiding.
    if (!(amount > 0)) return;
    let alive = true;
    const t = setTimeout(() => {
      api
        .get<SwapQuoteResult>(`/swap/quote?in=${inSymbol}&out=${outSymbol}&amount=${amount}`)
        .then((q) => {
          if (alive) setSettled({ key, data: q });
        })
        .catch((e: unknown) => {
          // No route is a real answer. The screen says so rather than showing a computed guess.
          if (alive) setSettled({ key, error: e instanceof Error ? e : new Error(String(e)) });
        });
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [key, inSymbol, outSymbol, amount]);

  if (!(amount > 0)) return { data: undefined, loading: false, error: undefined };
  return {
    data: settled.key === key ? settled.data : undefined,
    loading: settled.key !== key,
    error: settled.key === key ? settled.error : undefined,
  };
}
