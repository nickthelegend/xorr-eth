/**
 * Screen 3 — Agent intro sheet. screens.md Group C.
 *
 * Full-bleed surface card, radius 34, close top-right. 104px orb, name, subtitle.
 * Three benefit blocks (22px outline glyph — circle, rounded square, rotated square) gap 26.
 * White "Get Started". Footnote "All agents can make mistakes. Markets are risky."
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Circle, Rect } from 'react-native-svg';
import { Icon } from '@/design/Icon';
import { AgentOrb, Button, Screen } from '@/design/components';
import { ink, surfaces } from '@/design/colors';
import { agentGradient } from '@/design/gradients';
import { type } from '@/design/type';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';

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
  const { data } = useAsync(() => repos.bot.listAgents(), []);
  const agent = (data ?? []).find((a) => a.id === id);

  return (
    <Screen background={surfaces.surface} gutter={false}>
      <View style={{ flex: 1, paddingHorizontal: 20 }}>
        <View style={{ alignItems: 'flex-end' }}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={12}
          >
            <Icon name="close" size={20} color={ink.i55} />
          </Pressable>
        </View>

        <View style={{ alignItems: 'center', marginTop: 10, gap: 14 }}>
          <AgentOrb
            gradient={agentGradient(agent?.name ?? 'Earnings Desk')}
            size={104}
            face
            specular
            bloom
            breathe
          />
          <Text style={[type.onboardingTitle, { color: ink.full, textAlign: 'center' }]}>
            {agent?.name ?? 'Stocks Trader'}
          </Text>
          <Text style={[type.body, { color: ink.i40, textAlign: 'center' }]}>
            {agent?.role ?? 'Autonomous stock trading agent'}
          </Text>
        </View>

        <Screen.Content style={{ marginTop: 34, gap: 26 }}>
          {BENEFITS.map((b) => (
            <View key={b.title} style={{ flexDirection: 'row', gap: 14 }}>
              <BenefitGlyph kind={b.glyph} />
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={[type.cardTitleSm, { color: ink.full }]}>{b.title}</Text>
                <Text style={[type.secondaryMd, { color: ink.i45, lineHeight: 12.5 * 1.5 }]}>
                  {b.body}
                </Text>
              </View>
            </View>
          ))}
        </Screen.Content>

        <Button label="Get Started" onPress={() => router.replace(`/bot/${id}/settings`)} />
        <Text style={[type.footnote, { color: ink.i28, textAlign: 'center', marginTop: 12 }]}>
          All agents can make mistakes. Markets are risky.
        </Text>
      </View>
    </Screen>
  );
}

function BenefitGlyph({ kind }: { kind: 'circle' | 'square' | 'diamond' }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" style={{ marginTop: 2 }}>
      {kind === 'circle' ? (
        <Circle cx={12} cy={12} r={8.5} stroke={ink.i55} strokeWidth={1.8} fill="none" />
      ) : kind === 'square' ? (
        <Rect x={4} y={4} width={16} height={16} rx={5} stroke={ink.i55} strokeWidth={1.8} fill="none" />
      ) : (
        <Rect
          x={5}
          y={5}
          width={14}
          height={14}
          rx={3}
          stroke={ink.i55}
          strokeWidth={1.8}
          fill="none"
          transform="rotate(45 12 12)"
        />
      )}
    </Svg>
  );
}
