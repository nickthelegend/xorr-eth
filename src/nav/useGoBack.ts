/**
 * Back, or somewhere sensible when there is no back.
 *
 * Every screen called `router.back()` directly — 47 times across 33 files — and none of them asked
 * whether there was anything to go back TO. There often is not: a deep link, a refresh, a shared
 * URL, or simply opening the app on a route other than the tab shell all produce a history of one.
 * expo-router then logs
 *
 *   The action 'GO_BACK' was not handled by any navigator. Is there any screen to go back to?
 *
 * and does nothing. The user sits on the form they just submitted, with no acknowledgement and no
 * way out but the browser's own back button — which is also empty. It is worst exactly where it
 * matters most: a screen that creates something and then "returns" leaves you staring at the
 * creation form, unsure whether it worked.
 *
 * React Navigation's warning says it is development-only, which is true of the LOG and not of the
 * behaviour: in production the same tap silently does nothing at all.
 */
import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';

/**
 * @param fallback Where to go when there is no history. The tab shell by default, because that is
 *                 the one destination every screen can reach and nobody is stranded on.
 */
export function useGoBack(fallback: Href = '/'): () => void {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(fallback);
  }, [router, fallback]);
}
