/**
 * Screen 10 — Portfolio proposal. screens.md Group A.
 *
 * Centred 56px strategist orb, title, subtitle. Card containing: an 8px stacked proportion bar
 * (three segments, 2px gaps, widths = normalised weights), three sleeve blocks (dot + name +
 * stepper, then an indented 11.5px rationale), an "Allocated" total row, then the CTA.
 *
 * weights default 55/30/15, +/-5 per tap. Total must equal 100 to approve — the CTA reads
 * "Balance to 100% first" (disabled), then "Approve & fund", then "Portfolio approved".
 * Total colour `up` at 100, `warn` otherwise. ANY WEIGHT EDIT CLEARS `approved`.
 *
 * After the pivot, approving this creates a real tier-2 rebalance strategy.
 */
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { AgentOrb, Button, Screen, SheetCard, Stepper } from '@/design/components';
import { ink, pnl } from '@/design/colors';
import { agentGradients } from '@/design/gradients';
import { DURATION } from '@/design/motion';
import { EASING } from '@/design/easing';
import { radius } from '@/design/space';
import { type } from '@/design/type';
import { motionDuration, useReducedMotion } from '@/design/useReducedMotion';
import { canApprove, proposalCta, weightBarPct, weightTotal } from '@/state/derived';
import { sleeveFixtures } from '@/data/fixtures/sleeves';
import { onboarding } from '@/data/fixtures/onboarding';
import { useStore } from '@/state/store';
import { repos } from '@/data';

export default function Proposal() {
  const router = useRouter();
  const weights = useStore((s) => s.weights);
  const bumpWeight = useStore((s) => s.bumpWeight);
  const approved = useStore((s) => s.approved);
  const setApproved = useStore((s) => s.setApproved);
  const riskQ = useStore((s) => s.riskQ);
  const cap = useStore((s) => s.cap);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const total = weightTotal(weights);
  const ok = canApprove(weights);
  const risk = onboarding.riskLevels[riskQ] ?? 'Balanced';

  async function approve() {
    if (!ok || approved) {
      if (approved) router.replace('/(tabs)');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await repos.strategies.create({
        kind: 'rebalance',
        state: 'live',
        label: 'Rebalance to targets',
        symbol: 'PORTFOLIO',
        params: { weights, sleeves: sleeveFixtures.map((s) => s.name) },
        cadence: 'weekly',
        dailyAllocationUsd: Math.round(cap / 4),
      });
      setApproved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: 14 }}>
        <AgentOrb gradient={agentGradients.Strategist} size={56} face specular bloom breathe />
        <Text style={[type.onboardingTitle, { color: ink.full, textAlign: 'center' }]}>
          Your draft portfolio
        </Text>
        <Text style={[type.body, { color: ink.i40, textAlign: 'center' }]}>
          Built from your goals and a {risk} risk setting. Move the weights — nothing is placed
          until you approve.
        </Text>
      </View>

      <Screen.Content style={{ marginTop: 24 }}>
        <SheetCard radius={radius.xl} padding={18}>
          <View style={{ flexDirection: 'row', gap: 2, height: 8 }}>
            {sleeveFixtures.map((s, i) => (
              <Bar key={s.name} pct={weightBarPct(weights, i)} color={s.color} />
            ))}
          </View>

          <View style={{ marginTop: 20, gap: 20 }}>
            {sleeveFixtures.map((s, i) => (
              <View key={s.name} style={{ gap: 8 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    justifyContent: 'space-between',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <View
                      style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.color }}
                    />
                    <Text style={[type.rowPrimary, { color: ink.full, flex: 1 }]}>{s.name}</Text>
                  </View>
                  <Stepper
                    value={`${weights[i] ?? 0}%`}
                    onDecrement={() => bumpWeight(i, -1)}
                    onIncrement={() => bumpWeight(i, 1)}
                    canDecrement={(weights[i] ?? 0) > 0}
                    canIncrement={(weights[i] ?? 0) < 100}
                    valueMinWidth={70}
                    accessibilityLabel={s.name}
                  />
                </View>
                <Text style={[type.noteBody, { color: ink.i45, paddingLeft: 18 }]}>{s.note}</Text>
              </View>
            ))}
          </View>

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 22,
            }}
          >
            <Text style={[type.rowPrimary, { color: ink.full }]}>Allocated</Text>
            <Text
              style={[type.rowPrimaryLg, { color: ok ? pnl.up : pnl.warn, fontWeight: '700' }]}
            >
              {total}%
            </Text>
          </View>
        </SheetCard>

        {error ? (
          <Text style={[type.noteBody, { color: pnl.down, marginTop: 14 }]}>{error}</Text>
        ) : null}
      </Screen.Content>

      <Button
        label={proposalCta(weights, approved)}
        variant={approved ? 'confirmed' : 'primary'}
        disabled={!ok && !approved}
        loading={busy}
        onPress={approve}
      />
    </Screen>
  );
}

function Bar({ pct, color }: { pct: number; color: string }) {
  const reduced = useReducedMotion();
  // animations.md: allocation bars are a 200ms WIDTH transition; the three retract/extend together.
  const style = useAnimatedStyle(() => ({
    width: withTiming(`${pct}%`, {
      duration: motionDuration(DURATION.bars, reduced),
      easing: EASING,
    }),
  }));
  return <Animated.View style={[{ height: 8, borderRadius: 4, backgroundColor: color }, style]} />;
}
