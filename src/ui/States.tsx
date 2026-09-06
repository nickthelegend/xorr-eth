/**
 * States.tsx — loading, error and empty. PLAN.md 10.11 [G17].
 *
 * animations.md §5 bans entrance animations and staggered list reveals, which rules out the
 * usual shimmer skeleton. The deliberate replacement: static grey blocks at the real row
 * height that swap instantly for content. Nothing moves; nothing fades.
 *
 * The height match matters more than it looks. A loading state shorter than the row it
 * stands in for makes the list jump when data lands, and a jump on a price list reads as a
 * market move.
 */
import React from 'react';
import { View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { Button } from './Button';
import { Press } from './Press';
import { Text } from './Text';
import { colors, divider, radius, size, space } from './tokens';

/** A static placeholder block. No shimmer, no pulse — see the module docblock. */
export function Placeholder({
  height,
  width = '100%',
  style,
}: {
  height: number;
  width?: DimensionValue;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        { height, width, borderRadius: radius.square, backgroundColor: colors.surfaceAlt },
        style,
      ]}
    />
  );
}

/** Rows-shaped loading state, so the list does not change height when data lands. */
export function LoadingRows({
  count = 6,
  height = size.rowLg,
  testID,
}: {
  count?: number;
  height?: number;
  testID?: string;
}) {
  return (
    <View testID={testID} accessibilityLabel="Loading">
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={[
            { height, flexDirection: 'row', alignItems: 'center', gap: space.s12 },
            divider,
          ]}
        >
          <Placeholder height={size.mark} width={size.mark} style={{ borderRadius: radius.full }} />
          <View style={{ flex: 1, gap: space.s6 }}>
            <Placeholder height={12} width="45%" />
            <Placeholder height={10} width="30%" />
          </View>
          <View style={{ alignItems: 'flex-end', gap: space.s6 }}>
            <Placeholder height={12} width={64} />
            <Placeholder height={10} width={44} />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * A failure the user can act on. The message is the real one off the error — a generic
 * "something went wrong" hides which of the executor, the price feed or the chain is down.
 */
export function ErrorState({
  error,
  onRetry,
  testID,
}: {
  error: Error;
  onRetry?: () => void;
  testID?: string;
}) {
  return (
    <View testID={testID} style={{ paddingVertical: space.s30, gap: space.s14, alignItems: 'center' }}>
      <Text variant="rowPrimary">That did not load.</Text>
      <Text variant="secondary" align="center">
        {error.message}
      </Text>
      {onRetry ? <Button label="Try again" variant="ghost" onPress={onRetry} /> : null}
    </View>
  );
}

/**
 * An empty list, with somewhere to go.
 *
 * Several screens ended at "Nothing here yet." — true, and a dead end. An empty state is the
 * first thing a new user sees on a screen, so it is the one place where telling them what to
 * do next is worth more than anything else that could occupy the space.
 *
 * The action is optional because some lists genuinely have no next step: an audit trail with
 * nothing in it is waiting on the bot, not on the user.
 */
export function EmptyState({
  text,
  actionLabel,
  onAction,
  testID,
}: {
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      style={{ paddingVertical: space.s30, alignItems: 'center', gap: space.s12 }}
    >
      <Text variant="body" color={colors.ink38} align="center">
        {text}
      </Text>
      {actionLabel && onAction ? (
        <Press
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          hitHeight={size.hit}
        >
          <Text variant="control">{actionLabel} ›</Text>
        </Press>
      ) : null}
    </View>
  );
}
