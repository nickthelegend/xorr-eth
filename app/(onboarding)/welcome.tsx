/**
 * Screen 1 — Splash. screens.md Group B.
 *
 * Lives at /welcome, NOT at the group index: both (onboarding) and (tabs) previously declared an
 * index route, so expo-router resolved "/" to whichever it found first and the Home tab rendered
 * the splash. The tabs group owns "/" now; app/index.tsx decides which one a given user sees.
 *
 * Wordmark 42/800, tagline. A card previewing the wallet. Blue #29A3F5 CTA + terms line.
 *
 * "The only screen using blue — it's pre-account, before the P&L color law applies."
 * [G11] The handoff's three grey placeholder pills are replaced with the three things the bot
 * actually does, which is what a pre-account preview should show.
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AgentOrb, Screen, SheetCard } from '@/design/components';
import { brand } from '@/design/brand';
import { ink, preAccount, pnl, surfaces } from '@/design/colors';
import { agentGradients } from '@/design/gradients';
import { radius } from '@/design/space';
import { type } from '@/design/type';
import { money, percent } from '@/format';

const PREVIEW = ['Recurring buys', 'Stops that hold', 'One-tap stop'] as const;

export default function Splash() {
  const router = useRouter();
  return (
    <Screen>
      <View style={{ alignItems: 'center', marginTop: 18, gap: 10 }}>
        <Text style={{ fontSize: 42, fontWeight: '800', color: ink.full, letterSpacing: 2 }}>
          {brand.WORDMARK}
        </Text>
        <Text style={[type.body, { color: ink.i40, textAlign: 'center' }]}>{brand.TAGLINE}</Text>
      </View>

      <Screen.Content style={{ justifyContent: 'center' }}>
        <SheetCard radius={radius.xxl2} padding={22}>
          <Text style={[type.eyebrowSm, { color: ink.i32 }]}>Total value</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <Text style={[type.heroBalance, { color: ink.full }]}>{money(63.28)}</Text>
            <View
              style={{
                backgroundColor: pnl.downBg,
                borderRadius: 12,
                paddingHorizontal: 8,
                paddingVertical: 3,
              }}
            >
              <Text style={[type.rowDelta, { color: pnl.down, fontWeight: '600' }]}>
                {percent(-1.4)}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 6, marginTop: 18, flexWrap: 'wrap' }}>
            {PREVIEW.map((p) => (
              <View
                key={p}
                style={{
                  backgroundColor: surfaces.surfaceAlt,
                  borderRadius: radius.lg2,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                }}
              >
                <Text style={[type.footnote, { color: ink.i55 }]}>{p}</Text>
              </View>
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: 18, marginTop: 24, justifyContent: 'center' }}>
            <AgentOrb gradient={agentGradients['Momentum Scout']} size={56} face specular breathe />
            <AgentOrb gradient={agentGradients['Yield Keeper']} size={56} face specular breathe />
            <AgentOrb gradient={agentGradients['Drawdown Guard']} size={56} face specular breathe />
          </View>
        </SheetCard>
      </Screen.Content>

      <Pressable
        onPress={() => router.push('/goals')}
        accessibilityRole="button"
        accessibilityLabel="Get started"
        style={({ pressed }) => ({
          height: 54,
          borderRadius: radius.xxl,
          backgroundColor: preAccount.blue,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text style={[type.buttonLabelLg, { color: '#FFFFFF' }]}>Get started</Text>
      </Pressable>
      <Text style={[type.footnote, { color: ink.i28, textAlign: 'center', marginTop: 12 }]}>
        {brand.TERMS}
      </Text>
    </Screen>
  );
}
