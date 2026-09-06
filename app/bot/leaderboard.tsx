/**
 * Screen 16 — Agent leaderboard. screens.md Group C.
 *
 * Sort circle. Segmented P&L / Win rate / Volume. Four cards: rank ("01" in `rankFirst` for
 * first, else ink30), 38pt orb, name + "{win}% win · {n} trades", signed P&L, then a 4pt bar
 * normalised to the max.
 *
 * animations.md: the bar is a 250ms WIDTH transition — the longest in the app, "because a
 * re-sort moves several bars at once and 250 lets the eye follow one".
 */
import React, { useEffect } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { agentGradient } from '@/design/gradients';
import {
  AssetMark,
  Fill,
  IconButton,
  LoadingRows,
  Price,
  Screen,
  Segmented,
  pnlTone,
  Text,
  colors,
  duration,
  radius,
  space,
  timing,
  useReducedMotion,
} from '@/ui';
import { signedMoney } from '@/format';
import {
  LEADERBOARD_KEYS,
  LEADERBOARD_LABELS,
  leaderboardBarPct,
  sortLeaderboard,
} from '@/state/derived';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import { useStore } from '@/state/store';
import type { Agent } from '@/data/types';

const BAR_H = 4;
const RANK_W = 22;
const ORB = 38;

const SORTS = LEADERBOARD_LABELS.map((label, value) => ({ value, label }));

export default function Leaderboard() {
  const router = useRouter();
  const lbSort = useStore((s) => s.lbSort);
  const setLbSort = useStore((s) => s.setLbSort);
  const { data, loading } = useAsync(() => repos.bot.leaderboard(), []);

  const rows = data ? sortLeaderboard(data, LEADERBOARD_KEYS[lbSort]!) : [];

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s8 }}>
          <IconButton
            name="back"
            accessibilityLabel="Back"
            background="none"
            onPress={() => router.back()}
          />
          <Text variant="screenTitle">Leaderboard</Text>
        </View>
        <IconButton
          name="sort"
          accessibilityLabel="Change sort"
          onPress={() => setLbSort((lbSort + 1) % SORTS.length)}
        />
      </View>

      <Text variant="secondary" style={{ marginTop: space.s10 }}>
        How your agents are actually doing against each other. Fire the laggards.
      </Text>

      <Segmented
        options={SORTS}
        value={lbSort}
        onChange={setLbSort}
        style={{ marginTop: space.s18 }}
      />

      <Fill style={{ marginTop: space.s14 }}>
        {loading && !data ? (
          <LoadingRows count={4} height={78} />
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: space.s12 }}
          >
            {rows.map((a, i) => (
              <LeaderRow key={a.id} agent={a} index={i} all={rows} />
            ))}
          </ScrollView>
        )}
      </Fill>

      <Text
        variant="footnote"
        color={colors.ink28}
        align="center"
        style={{ marginTop: space.s12 }}
      >
        Ranked by {LEADERBOARD_LABELS[lbSort]} · last 30 days
      </Text>
    </Screen>
  );
}

function LeaderRow({ agent, index, all }: { agent: Agent; index: number; all: Agent[] }) {
  const reduced = useReducedMotion();
  const pct = leaderboardBarPct(agent.pnl30d, all);

  // Seeded at the current width and advanced on change — a `withTiming` inside
  // `useAnimatedStyle` grows every bar from zero on mount, which animations.md forbids.
  const width = useSharedValue(pct);
  useEffect(() => {
    width.value = withTiming(pct, timing(duration.slow, reduced));
  }, [pct, reduced, width]);
  const bar = useAnimatedStyle(() => ({ width: `${width.value}%` }));

  // Green means profit and red means loss. A flat agent has made neither, so it takes
  // neither colour — "+$0.00" in profit-green reads as a win that did not happen.
  const tone = pnlTone(agent.pnl30d);
  const barColor =
    tone === 'up' ? colors.up : tone === 'down' ? colors.down : colors.ink30;

  return (
    <View style={{ gap: space.s10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s12 }}>
        <Price
          color={index === 0 ? colors.rankFirst : colors.ink30}
          style={{ width: RANK_W }}
        >
          {String(index + 1).padStart(2, '0')}
        </Price>
        <AssetMark gradient={agentGradient(agent.name)} size={ORB} />
        <View style={{ flex: 1, gap: space.s2 }}>
          <Text variant="rowPrimary">{agent.name}</Text>
          <Text variant="secondarySm">
            {agent.win}% win · {agent.trades} trades
          </Text>
        </View>
        <Price variant="rowPrimaryLg" tone={tone}>
          {signedMoney(agent.pnl30d)}
        </Price>
      </View>
      <View style={{ height: BAR_H, borderRadius: radius.full, backgroundColor: colors.control }}>
        <Animated.View
          style={[
            {
              height: BAR_H,
              borderRadius: radius.full,
              backgroundColor: barColor,
            },
            bar,
          ]}
        />
      </View>
    </View>
  );
}
