/**
 * Screen 3 — Agent intro sheet. screens.md Group C.
 *
 * Full-bleed surface card, radius 34, close top-right. 104pt orb, name, subtitle.
 * Three benefit blocks (22pt outline glyph — circle, rounded square, rotated square) gap 26.
 * White "Get Started". Footnote "All agents can make mistakes. Markets are risky."
 */
import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useGoBack } from '@/nav/useGoBack';
import Svg, { Circle, Rect } from 'react-native-svg';
import { agentGradient } from '@/design/gradients';
import {
  AgentOrb,
  Button,
  Fill,
  IconButton,
  Screen,
  Text,
  colors,
  radius,
  size,
  space,
} from '@/ui';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';

const GLYPH = 22;
const STROKE = 1.8;

const BENEFITS = [
  {
    glyph: 'circle',
    title: 'Runs for you 24/7',
    body: 'Keeps watching your markets and running your rules, even when you are offline.',
  },
  {
    glyph: 'square',
    title: 'Never miss big moves',
    body: 'Tracks big price moves and key news, then triggers your preset actions.',
  },
  {
    glyph: 'diamond',
    title: 'You are always in control',
    body: 'Set limits, edit or pause strategies anytime. The agent never trades outside your rules.',
  },
] as const;

export default function AgentIntro() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const goBack = useGoBack();
  const { data, loading } = useAsync(() => repos.bot.listAgents(), []);
  const agent = (data ?? []).find((a) => a.id === id);

  return (
    // A sheet, not a screen: it sits on `surface` with the card radius, and the modal
    // presentation in `app/_layout.tsx` is what puts black behind it.
    <Screen style={{ backgroundColor: colors.surface, borderRadius: radius.sheetLg }}>
      <View style={{ alignItems: 'flex-end' }}>
        <IconButton
          name="close"
          accessibilityLabel="Close"
          onPress={() => goBack()}
          background="none"
          glyph={20}
        />
      </View>

      <View style={{ alignItems: 'center', marginTop: space.s10, gap: space.s14 }}>
        <AgentOrb
          gradient={agentGradient(agent?.name ?? 'Earnings Desk')}
          size={size.orb104}
          face
          specular
          bloom
        />
        <Text variant="onboardingTitle" align="center">
          {agent?.name ?? (loading ? 'Loading…' : 'No such agent')}
        </Text>
        <Text variant="body" color={colors.ink40} align="center">
          {/* Not a different agent's description. These fell back to "Stocks Trader /
              Autonomous stock trading agent" whenever the id did not resolve, so a bad
              link introduced an agent that does not exist. */}
          {agent?.role ?? (loading ? '' : 'This agent is not on the roster.')}
        </Text>
      </View>

      <Fill style={{ marginTop: space.s34, gap: space.s26 }}>
        {BENEFITS.map((b) => (
          <View key={b.title} style={{ flexDirection: 'row', gap: space.s14 }}>
            <BenefitGlyph kind={b.glyph} />
            <View style={{ flex: 1, gap: space.s6 }}>
              <Text variant="cardTitle">{b.title}</Text>
              <Text variant="secondary" color={colors.ink45}>
                {b.body}
              </Text>
            </View>
          </View>
        ))}
      </Fill>

      <Button label="Get Started" onPress={() => router.replace(`/bot/${id}/settings`)} />
      <Text
        variant="footnote"
        color={colors.ink28}
        align="center"
        style={{ marginTop: space.s12 }}
      >
        All agents can make mistakes. Markets are risky.
      </Text>
    </Screen>
  );
}

function BenefitGlyph({ kind }: { kind: 'circle' | 'square' | 'diamond' }) {
  return (
    <Svg width={GLYPH} height={GLYPH} viewBox="0 0 24 24" style={{ marginTop: space.s2 }}>
      {kind === 'circle' ? (
        <Circle cx={12} cy={12} r={8.5} stroke={colors.ink55} strokeWidth={STROKE} fill="none" />
      ) : kind === 'square' ? (
        <Rect
          x={4}
          y={4}
          width={16}
          height={16}
          rx={5}
          stroke={colors.ink55}
          strokeWidth={STROKE}
          fill="none"
        />
      ) : (
        <Rect
          x={5}
          y={5}
          width={14}
          height={14}
          rx={3}
          stroke={colors.ink55}
          strokeWidth={STROKE}
          fill="none"
          transform="rotate(45 12 12)"
        />
      )}
    </Svg>
  );
}
