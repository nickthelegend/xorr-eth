/**
 * Screen 4 — Trade settings. screens.md Group C.
 *
 * Card: 34px violet orb, "Trade Settings", limits explainer. Four 56px rows —
 *   Run For (pill, cycles 1/3/7/30 Days)
 *   Trade Autonomously (switch PLUS a state caption — design.md §5 requires it)
 *   Risk Level (pill, Low/Medium/High)
 *   Daily Spend Cap (stepper $200-$5,000 by $200)
 * Under the cap: a 6px green->amber->red rail with a white marker at (cap-200)/4800,
 * endpoints "$200 · conservative" / "$5,000 · max".
 *
 * PLAN.md 6.7: after the pivot these four controls are NOT preferences — they are the delegation
 * policy. The CTA signs a transaction, it does not save a setting.
 */
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import {
  AgentOrb,
  Button,
  Pill,
  Screen,
  ScreenHeader,
  SheetCard,
  Stepper,
  Switch,
} from '@/design/components';
import { Icon } from '@/design/Icon';
import { borders, ink, pnl } from '@/design/colors';
import { agentGradients } from '@/design/gradients';
import { DURATION } from '@/design/motion';
import { EASING } from '@/design/easing';
import { hairlineWidth, radius } from '@/design/space';
import { type } from '@/design/type';
import { motionDuration, useReducedMotion } from '@/design/useReducedMotion';
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

export default function TradeSettings() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const auto = useStore((s) => s.auto);
  const setAuto = useStore((s) => s.setAuto);
  const runFor = useStore((s) => s.runFor);
  const cycleRunFor = useStore((s) => s.cycleRunFor);
  const risk = useStore((s) => s.risk);
  const cycleRisk = useStore((s) => s.cycleRisk);
  const cap = useStore((s) => s.cap);
  const bumpCap = useStore((s) => s.bumpCap);
  const setDelegation = useStore((s) => s.setDelegation);

  const marker = useAnimatedStyle(() => ({
    left: withTiming(`${capMarkerPct(cap)}%`, {
      duration: motionDuration(DURATION.base, reduced),
      easing: EASING,
    }),
  }));

  async function commit() {
    setBusy(true);
    setError(undefined);
    try {
      // These controls ARE the policy. Changing them re-signs the on-chain authority.
      const d = await repos.wallet.grantDelegation({
        dailyCapUsd: cap,
        durationMs: runForMs(runFor),
      });
      setDelegation(d);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScreenHeader
        left={<Text style={[type.screenTitle, { color: ink.full }]}>Trade Settings</Text>}
      />
      <Text style={[type.secondary, { color: ink.i40, marginTop: 10 }]}>
        You can change these anytime. The agent always stays within these limits.
      </Text>

      <Screen.Content style={{ marginTop: 20 }}>
        <SheetCard radius={radius.xl} padding={16}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <AgentOrb gradient={agentGradients.Strategist} size={34} />
            <Text style={[type.cardTitleSm, { color: ink.full, flex: 1 }]}>Limits</Text>
            <Icon name="chevron" size={13} color={ink.i55} />
          </View>

          <SettingRow label="Run For">
            <Pill label={RUN_FOR[runFor]!} selected onPress={cycleRunFor} />
          </SettingRow>

          <View
            style={{
              minHeight: 56,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingVertical: 8,
              borderBottomWidth: hairlineWidth,
              borderBottomColor: borders.hairline,
            }}
          >
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={[type.rowPrimary, { color: ink.full }]}>Trade Autonomously</Text>
              {/* The caption design.md makes mandatory on a switch that authorises spending. */}
              <Text style={[type.secondary, { color: ink.i38 }]}>{autoNote(auto)}</Text>
            </View>
            <Switch value={auto} onValueChange={setAuto} accessibilityLabel="Trade autonomously" />
          </View>

          <SettingRow label="Risk Level">
            <Pill label={RISK_LEVELS[risk]!} selected onPress={cycleRisk} />
          </SettingRow>

          <SettingRow label="Daily Spend Cap" divider={false}>
            <Stepper
              value={capLabel(cap)}
              onDecrement={() => bumpCap(-1)}
              onIncrement={() => bumpCap(1)}
              canDecrement={cap > CAP_MIN}
              canIncrement={cap < CAP_MAX}
              valueMinWidth={88}
              accessibilityLabel="Daily spend cap"
            />
          </SettingRow>

          <View style={{ marginTop: 14 }}>
            <View style={{ height: 6, borderRadius: 3, overflow: 'hidden' }}>
              <LinearGradient
                colors={[pnl.up, pnl.warn, pnl.down]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ height: 6 }}
              />
              <Animated.View
                style={[
                  {
                    position: 'absolute',
                    top: -2,
                    width: 3,
                    height: 10,
                    borderRadius: 2,
                    backgroundColor: ink.full,
                  },
                  marker,
                ]}
              />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
              <Text style={[type.footnoteSm, { color: ink.i28 }]}>$200 · conservative</Text>
              <Text style={[type.footnoteSm, { color: ink.i28 }]}>$5,000 · max</Text>
            </View>
          </View>
        </SheetCard>

        {error ? (
          <Text style={[type.noteBody, { color: pnl.down, marginTop: 14 }]}>{error}</Text>
        ) : null}
      </Screen.Content>

      <Button label={runLabel(auto)} loading={busy} onPress={commit} />
      <Text style={[type.footnote, { color: ink.i28, textAlign: 'center', marginTop: 12 }]}>
        These limits are signed on-chain. The bot cannot exceed them, and you can revoke in one tap.
      </Text>
    </Screen>
  );
}

function SettingRow({
  label,
  children,
  divider = true,
}: {
  label: string;
  children: React.ReactNode;
  divider?: boolean;
}) {
  return (
    <View
      style={{
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        borderBottomWidth: divider ? hairlineWidth : 0,
        borderBottomColor: borders.hairline,
      }}
    >
      <Text style={[type.rowPrimary, { color: ink.full }]}>{label}</Text>
      {children}
    </View>
  );
}
