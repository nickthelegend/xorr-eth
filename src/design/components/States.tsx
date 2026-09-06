/**
 * Loading / error / empty states — PLAN.md 10.11 [G17].
 *
 * animations.md §5 bans entrance animations and staggered list reveals, which rules out the usual
 * shimmer skeleton. The deliberate replacement: static grey blocks at the real row height that
 * swap instantly for content. Nothing moves; nothing fades.
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { borders, ink, pnl, surfaces } from '../colors';
import { hairlineWidth, radius } from '../space';
import { type } from '../type';
import { Button } from './Button';

/** A static placeholder block. No shimmer, no pulse — see the module docblock. */
export function Placeholder({ height, width = '100%', style }: { height: number; width?: number | `${number}%`; style?: object }) {
  return (
    <View
      style={[
        { height, width, borderRadius: radius.sm, backgroundColor: surfaces.surfaceAlt },
        style,
      ]}
    />
  );
}

/** Rows-shaped loading state so the list does not change height when data lands. */
export function LoadingRows({ count = 6, height = 66 }: { count?: number; height?: number }) {
  return (
    <View accessibilityLabel="Loading">
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={{
            height,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            borderBottomWidth: hairlineWidth,
            borderBottomColor: borders.hairline,
          }}
        >
          <Placeholder height={34} width={34} style={{ borderRadius: 17 }} />
          <View style={{ flex: 1, gap: 6 }}>
            <Placeholder height={12} width="45%" />
            <Placeholder height={10} width="30%" />
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <Placeholder height={12} width={64} />
            <Placeholder height={10} width={44} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <View style={{ paddingVertical: 30, gap: 14, alignItems: 'center' }}>
      <Text style={[type.rowPrimary, { color: ink.full }]}>That did not load.</Text>
      <Text style={[type.secondary, { color: ink.i40, textAlign: 'center' }]}>{error.message}</Text>
      {onRetry ? <Button label="Try again" variant="ghost" onPress={onRetry} /> : null}
    </View>
  );
}

/**
 * An empty list, with somewhere to go.
 *
 * Several screens ended at "Nothing here yet." — true, and a dead end. An empty state is the first
 * thing a new user sees on a screen, so it is the one place where telling them what to do next is
 * worth more than anything else that could occupy the space. The action is optional because some
 * lists genuinely have no next step: an audit trail with nothing in it is waiting on the bot, not
 * on the user.
 */
export function EmptyState({
  text,
  actionLabel,
  onAction,
}: {
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={{ paddingVertical: 30, alignItems: 'center', gap: 12 }}>
      <Text style={[type.body, { color: ink.i38, textAlign: 'center' }]}>{text}</Text>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
        >
          <Text style={[type.pill, { color: ink.full }]}>{actionLabel} ›</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * The SIMULATED tag. PLAN.md §1.3 item 8: "Never present synthetic data as live."
 * Uses `warn`, not a P&L color — it is a caution, not a loss.
 */
/** design.md's `warn` at 14%, matching the delta-chip background convention. */
const SIMULATED_BG = 'rgba(232,198,74,0.14)';

export function SimulatedTag({ label = 'Simulated' }: { label?: string }) {
  return (
    <View
      style={{
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: radius.xs2,
        backgroundColor: SIMULATED_BG,
      }}
    >
      <Text style={[type.tagSm, { color: pnl.warn }]}>{label}</Text>
    </View>
  );
}
