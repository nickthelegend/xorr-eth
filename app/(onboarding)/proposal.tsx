/**
 * Screen 10 — Portfolio proposal. screens.md Group A.
 *
 * Centred 56pt strategist orb, title, subtitle. Card containing: an 8pt stacked proportion
 * bar (three segments, 2pt gaps, widths = normalised weights), three sleeve blocks (dot +
 * name + stepper, then an indented rationale), an "Allocated" total row, then the CTA.
 *
 * weights default 55/30/15, ±5 per tap. Total must equal 100 to approve — the CTA reads
 * "Balance to 100% first" (disabled), then "Approve & fund", then "Portfolio approved".
 * Total colour `up` at 100, `warn` otherwise. ANY WEIGHT EDIT CLEARS `approved`.
 *
 * After the pivot, approving this creates a real tier-2 rebalance strategy.
 */
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { agentGradients } from '@/design/gradients';
import {
  AgentOrb,
  Button,
  Fill,
  Price,
  Screen,
  SheetCard,
  Stepper,
  Text,
  colors,
  duration,
  radius,
  size,
  space,
  timing,
  useReducedMotion,
} from '@/ui';
import { canApprove, proposalCta, weightBarPct, weightTotal } from '@/state/derived';
import { sleeveFixtures } from '@/data/fixtures/sleeves';
import { onboarding } from '@/data/fixtures/onboarding';
import { useStore } from '@/state/store';
import { repos } from '@/data';

const BAR_H = 8;

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
      <View style={{ alignItems: 'center', gap: space.s14 }}>
        <AgentOrb gradient={agentGradients.Strategist} size={size.orb56} face specular bloom />
        <Text variant="onboardingTitle" align="center">
          Your draft portfolio
        </Text>
        <Text variant="body" color={colors.ink40} align="center">
          Built from your goals and a {risk} risk setting. Move the weights — nothing is
          placed until you approve.
        </Text>
      </View>

      <Fill style={{ marginTop: space.s26 }}>
        <SheetCard borderRadius={radius.panel} padding={space.s18}>
          <View style={{ flexDirection: 'row', gap: space.s2, height: BAR_H }}>
            {sleeveFixtures.map((s, i) => (
              <Bar key={s.name} pct={weightBarPct(weights, i)} color={s.color} />
            ))}
          </View>

          <View style={{ marginTop: space.s20, gap: space.s20 }}>
            {sleeveFixtures.map((s, i) => (
              <View key={s.name} style={{ gap: space.s8 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.s10,
                    justifyContent: 'space-between',
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: space.s10,
                      flex: 1,
                    }}
                  >
                    <View
                      style={{
                        width: BAR_H,
                        height: BAR_H,
                        borderRadius: BAR_H / 2,
                        backgroundColor: s.color,
                      }}
                    />
                    <Text variant="rowPrimary" style={{ flex: 1 }}>
                      {s.name}
                    </Text>
                  </View>
                  <Stepper
                    value={`${weights[i] ?? 0}%`}
                    onDecrement={() => bumpWeight(i, -1)}
                    onIncrement={() => bumpWeight(i, 1)}
                    canDecrement={(weights[i] ?? 0) > 0}
                    canIncrement={(weights[i] ?? 0) < 100}
                    valueMinWidth={size.stepperValueMinWSm}
                  />
                </View>
                {/* Indented to the dot's text column, so the rationale reads as belonging to
                    the sleeve above it rather than to the card. */}
                <Text variant="secondarySm" color={colors.ink45} style={{ paddingLeft: space.s18 }}>
                  {s.note}
                </Text>
              </View>
            ))}
          </View>

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: space.s22,
            }}
          >
            <Text variant="rowPrimary">Allocated</Text>
            <Price variant="value" color={ok ? colors.up : colors.warn}>
              {total}%
            </Price>
          </View>
        </SheetCard>

        {error ? (
          <Text variant="secondarySm" color={colors.down} style={{ marginTop: space.s14 }}>
            {error}
          </Text>
        ) : null}
      </Fill>

      <Button
        label={proposalCta(weights, approved)}
        variant={approved ? 'success' : 'primary'}
        disabled={!ok && !approved}
        loading={busy}
        onPress={approve}
      />
    </Screen>
  );
}

/**
 * One segment of the proportion bar.
 *
 * The width is seeded at the current weight and advanced from a `useEffect`. Returning
 * `withTiming` out of `useAnimatedStyle` — as this did — starts every segment at 0 and grows
 * it on mount, which is an entrance animation, and animations.md §5 has none.
 *
 * animations.md's inventory lists 200ms here, contradicting its own "150 / 180 / 250 and
 * nothing else" rule. The rule wins; `duration.base` is 180.
 */
function Bar({ pct, color }: { pct: number; color: string }) {
  const reduced = useReducedMotion();
  const width = useSharedValue(pct);

  useEffect(() => {
    width.value = withTiming(pct, timing(duration.base, reduced));
  }, [pct, reduced, width]);

  const style = useAnimatedStyle(() => ({ width: `${width.value}%` }));

  return (
    <Animated.View
      style={[{ height: BAR_H, borderRadius: BAR_H / 2, backgroundColor: color }, style]}
    />
  );
}
