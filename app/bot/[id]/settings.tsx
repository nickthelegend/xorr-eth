/**
 * Screen 4 — Trade settings. screens.md Group C.
 *
 * Card: 34pt violet orb, "Limits", explainer. Four 56pt rows —
 *   Run For (pill, cycles 1/3/7/30 Days)
 *   Trade Autonomously (switch PLUS a state caption — design.md §5 requires it)
 *   Risk Level (pill, Low/Medium/High)
 *   Daily Spend Cap (stepper $200–$5,000 by $200)
 * Under the cap: a 6pt green→amber→red rail with a white marker at (cap−200)/4800,
 * endpoints "$200 · conservative" / "$5,000 · max".
 *
 * PLAN.md 6.7: after the pivot these four controls are NOT preferences — they are the
 * delegation policy. The CTA signs a transaction, it does not save a setting.
 */
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useGoBack } from '@/nav/useGoBack';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/design/Icon';
import { agentGradients } from '@/design/gradients';
import {
  AssetMark,
  Button,
  Fill,
  Pill,
  Row,
  Screen,
  SheetCard,
  Stepper,
  Switch,
  Text,
  colors,
  divider as dividerStyle,
  duration,
  money,
  radius,
  size,
  space,
  timing,
  useReducedMotion,
} from '@/ui';
import { useGrantDelegation } from '@/auth/useGrantDelegation';
import {
  CAP_MAX,
  CAP_MIN,
  RISK_LEVELS,
  RUN_FOR,
  autoNote,
  capLabel,
  capMarkerPct,
  runForMs,
  runLabel,
} from '@/state/derived';
import { useStore } from '@/state/store';
import { repos } from '@/data';

const RAIL_H = 6;
const MARKER_W = 3;
const MARKER_H = 10;

export default function TradeSettings() {
  const goBack = useGoBack();
  const reduced = useReducedMotion();
  const [localError, setLocalError] = useState<string>();
  // These four controls ARE the delegation policy, so saving them is a signature, not a
  // save — and it is the user's wallet that signs it, never the executor.
  const { grant: signGrant, busy, error: txError } = useGrantDelegation();
  const error = localError ?? txError;

  const auto = useStore((s) => s.auto);
  const setAuto = useStore((s) => s.setAuto);
  const runFor = useStore((s) => s.runFor);
  const cycleRunFor = useStore((s) => s.cycleRunFor);
  const risk = useStore((s) => s.risk);
  const cycleRisk = useStore((s) => s.cycleRisk);
  const cap = useStore((s) => s.cap);
  const bumpCap = useStore((s) => s.bumpCap);
  const setDelegation = useStore((s) => s.setDelegation);

  const target = capMarkerPct(cap);
  const pct = useSharedValue(target);
  useEffect(() => {
    pct.value = withTiming(target, timing(duration.base, reduced));
  }, [target, reduced, pct]);
  const marker = useAnimatedStyle(() => ({ left: `${pct.value}%` }));

  async function commit() {
    setLocalError(undefined);
    try {
      await signGrant(cap, runForMs(runFor));
      // Read it back from the chain rather than trusting what we just sent.
      const d = await repos.wallet.delegation();
      setDelegation(d);
      goBack();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Screen>
      <Text variant="screenTitle">Trade Settings</Text>
      <Text variant="secondary" style={{ marginTop: space.s10 }}>
        You can change these anytime. The agent always stays within these limits.
      </Text>

      <Fill style={{ marginTop: space.s20 }}>
        <SheetCard borderRadius={radius.panel} padding={space.s16}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s12 }}>
            <AssetMark gradient={agentGradients.Strategist} size={size.mark} />
            <Text variant="cardTitle" style={{ flex: 1 }}>
              Limits
            </Text>
            <Icon name="chevron" size={13} color={colors.ink55} />
          </View>

          <Row
            title="Run For"
            right={<Pill label={RUN_FOR[runFor]!} selected onPress={cycleRunFor} />}
            height={size.row}
          />

          <View
            style={[
              {
                minHeight: size.row,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.s12,
                paddingVertical: space.s8,
              },
              dividerStyle,
            ]}
          >
            <View style={{ flex: 1, gap: space.s2 }}>
              <Text variant="rowPrimary">Trade Autonomously</Text>
              {/* The caption design.md makes mandatory on a switch that authorises spending. */}
              <Text variant="secondarySm">{autoNote(auto)}</Text>
            </View>
            <Switch on={auto} onChange={setAuto} accessibilityLabel="Trade autonomously" />
          </View>

          <Row
            title="Risk Level"
            right={<Pill label={RISK_LEVELS[risk]!} selected onPress={cycleRisk} />}
            height={size.row}
          />

          <Row
            title="Daily Spend Cap"
            divider={false}
            height={size.row}
            right={
              <Stepper
                value={capLabel(cap)}
                onDecrement={() => bumpCap(-1)}
                onIncrement={() => bumpCap(1)}
                canDecrement={cap > CAP_MIN}
                canIncrement={cap < CAP_MAX}
                valueMinWidth={size.stepperValueMinW}
              />
            }
          />

          <View style={{ marginTop: space.s14 }}>
            <View style={{ height: RAIL_H, borderRadius: radius.full, overflow: 'hidden' }}>
              <LinearGradient
                colors={[colors.up, colors.warn, colors.down]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ height: RAIL_H }}
              />
              <Animated.View
                style={[
                  {
                    position: 'absolute',
                    top: -2,
                    width: MARKER_W,
                    height: MARKER_H,
                    borderRadius: MARKER_W / 2,
                    backgroundColor: colors.ink,
                  },
                  marker,
                ]}
              />
            </View>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginTop: space.s8,
              }}
            >
              <Text variant="footnoteSm" color={colors.ink28}>
                {money(CAP_MIN, { decimals: 0 })} · conservative
              </Text>
              <Text variant="footnoteSm" color={colors.ink28}>
                {money(CAP_MAX, { decimals: 0 })} · max
              </Text>
            </View>
          </View>
        </SheetCard>

        {error ? (
          <Text variant="secondarySm" color={colors.down} style={{ marginTop: space.s14 }}>
            {error}
          </Text>
        ) : null}
      </Fill>

      <Button label={runLabel(auto)} loading={busy} onPress={commit} />
      <Text
        variant="footnote"
        color={colors.ink28}
        align="center"
        style={{ marginTop: space.s12 }}
      >
        These limits are signed on-chain. The bot cannot exceed them, and you can revoke in
        one tap.
      </Text>
    </Screen>
  );
}
