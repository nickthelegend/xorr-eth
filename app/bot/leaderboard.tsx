/**
 * Screen 16 — Agent leaderboard. screens.md Group C.
 *
 * Sort circle. Segmented P&L / Win rate / Volume. Four cards: rank ("01" in #F0BE55 for first,
 * else ink30), 38px orb, name + "{win}% win · {n} trades", signed P&L 15/700, then a 4px bar
 * normalised to the max.
 *
 * animations.md: the bar is a 250ms WIDTH transition — the longest in the app, "because a re-sort
 * moves several bars at once and 250 lets the eye follow one".
 */
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import {
  AgentOrb,
  IconButton,
  LoadingRows,
  Screen,
  ScreenHeader,
  Segmented,
} from '@/design/components';
import { ink, pnl, rank as rankColor, surfaces } from '@/design/colors';
import { agentGradient } from '@/design/gradients';
import { DURATION } from '@/design/motion';
import { EASING } from '@/design/easing';
import { type } from '@/design/type';
import { motionDuration, useReducedMotion } from '@/design/useReducedMotion';
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

export default function Leaderboard() {
  const router = useRouter();
  const lbSort = useStore((s) => s.lbSort);
  const setLbSort = useStore((s) => s.setLbSort);
  const { data, loading } = useAsync(() => repos.bot.leaderboard(), []);

  const rows = data ? sortLeaderboard(data, LEADERBOARD_KEYS[lbSort]!) : [];

  return (
    <Screen>
      <ScreenHeader
        left={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <IconButton
              name="back"
              accessibilityLabel="Back"
              background="transparent"
              color={ink.i55}
              onPress={() => router.back()}
            />
            <Text style={[type.screenTitle, { color: ink.full }]}>Leaderboard</Text>
          </View>
        }
        right={<IconButton name="sort" accessibilityLabel="Change sort" onPress={() => setLbSort((lbSort + 1) % 3)} />}
      />

      <Text style={[type.secondary, { color: ink.i40, marginTop: 10 }]}>
        How your agents are actually doing against each other. Fire the laggards.
      </Text>

      <Segmented
        options={LEADERBOARD_LABELS}
        value={lbSort}
        onChange={setLbSort}
        style={{ marginTop: 18 }}
        accessibilityLabel="Sort leaderboard"
      />

      <Screen.Content style={{ marginTop: 14 }}>
        {loading && !data ? (
          <LoadingRows count={4} height={78} />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
            {rows.map((a, i) => (
              <LeaderRow key={a.id} agent={a} index={i} all={rows} />
            ))}
          </ScrollView>
        )}
      </Screen.Content>

      <Text style={[type.footnote, { color: ink.i28, textAlign: 'center', marginTop: 12 }]}>
        Ranked by {LEADERBOARD_LABELS[lbSort]} · last 30 days
      </Text>
    </Screen>
  );
}

function LeaderRow({ agent, index, all }: { agent: Agent; index: number; all: Agent[] }) {
  const reduced = useReducedMotion();
  const pct = leaderboardBarPct(agent.pnl30d, all);

  const bar = useAnimatedStyle(() => ({
    width: withTiming(`${pct}%`, {
      duration: motionDuration(DURATION.slow, reduced),
      easing: EASING,
    }),
  }));

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text
          style={[
            type.rowValue,
            { color: index === 0 ? rankColor.first : ink.i30, width: 22 },
          ]}
        >
          {String(index + 1).padStart(2, '0')}
        </Text>
        <AgentOrb gradient={agentGradient(agent.name)} size={38} face />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[type.rowPrimary, { color: ink.full }]}>{agent.name}</Text>
          <Text style={[type.secondary, { color: ink.i38 }]}>
            {agent.win}% win · {agent.trades} trades
          </Text>
        </View>
        <Text
          style={[
            type.rowPrimaryLg,
            { color: agent.pnl30d >= 0 ? pnl.up : pnl.down, fontWeight: '700' },
          ]}
        >
          {signedMoney(agent.pnl30d)}
        </Text>
      </View>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: surfaces.control }}>
        <Animated.View
          style={[
            {
              height: 4,
              borderRadius: 2,
              backgroundColor: agent.pnl30d >= 0 ? pnl.up : pnl.down,
            },
            bar,
          ]}
        />
      </View>
    </View>
  );
}
