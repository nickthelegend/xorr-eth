/**
 * Pull to refresh, on the lists that show something changing.
 *
 * Every list here reads once on mount and then sits there. The bot trades while nobody is looking
 * — that is the entire product — so a list of what it did is stale from the moment it renders, and
 * the only way to see anything new was to navigate away and come back. On a phone, pulling down is
 * the gesture people already try; it simply did nothing.
 *
 * A hook rather than a component because `RefreshControl` is a prop on the scrolling view, not a
 * wrapper around it, and because the spinner's own state has to outlive the fetch: `useAsync` sets
 * `loading` only while nothing is cached, so a refresh of a list that already has data never sets
 * it, and the control would snap back before the request finished.
 */
import React, { useCallback, useState } from 'react';
import { RefreshControl, type RefreshControlProps } from 'react-native';
import { colors } from './tokens';

export function useRefreshControl(reload: () => unknown): React.ReactElement<RefreshControlProps> {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // `reload` may be sync or a promise; both are ended the same way. The minimum is deliberate:
    // a spinner that vanishes in 40ms reads as the gesture not having worked.
    void Promise.all([Promise.resolve(reload()), new Promise((r) => setTimeout(r, 400))]).finally(
      () => setRefreshing(false),
    );
  }, [reload]);

  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      // The app is true black; the platform default spinner is invisible on it.
      tintColor={colors.ink45}
      colors={[colors.ink45]}
      progressBackgroundColor={colors.surface}
    />
  );
}
