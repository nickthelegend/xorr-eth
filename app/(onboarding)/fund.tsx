/**
 * NEW — Fund wallet. PLAN.md 7.4, REPLACING screen 9 (Add funds).
 *
 * [G44] The LAYOUT is screen 9 verbatim: 52/700 centred amount, preset pills, three radio cards
 * (surface, radius 22, padding 16 — selected gets selectedBorder + a 6px white dot, unselected a
 * 1.5px rgba(255,255,255,.25) ring, each with a right-aligned tag chip), fee + availability rows.
 * Only the three METHODS change, because there is no custodial rail to fund.
 *
 * [G42] The availability line is computed, not the handoff's frozen "Tue, Sep 8".
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Pill, PillRow, Progress, Row, Screen } from '@/design/components';
import { borders, ink, surfaces } from '@/design/colors';
import { hairlineWidth, radius } from '@/design/space';
import { type } from '@/design/type';
import { businessDaysFromNow, money } from '@/format';
import { depositFee } from '@/state/derived';
import { useStore } from '@/state/store';

const METHODS = [
  {
    name: 'Transfer from an exchange',
    detail: 'Withdraw to your address',
    tag: 'Free',
    feePct: 0,
    lands: () => businessDaysFromNow(1),
  },
  {
    name: 'On-chain deposit',
    detail: 'USDC, USDT or SOL',
    tag: 'On-chain',
    feePct: 0,
    lands: () => 'After 1 confirmation',
  },
  {
    name: 'Card on-ramp',
    detail: 'Third-party provider',
    tag: 'Instant',
    feePct: 1.5,
    lands: () => 'Right away',
  },
] as const;

const PRESETS = [250, 500, 1000, 2500];

export default function Fund() {
  const router = useRouter();
  const dep = useStore((s) => s.dep);
  const setDep = useStore((s) => s.setDep);
  const method = useStore((s) => s.method);
  const setMethod = useStore((s) => s.setMethod);

  const m = METHODS[method] ?? METHODS[0];
  const fee = depositFee(dep, m.feePct);

  return (
    <Screen>
      <Progress step={3} total={3} onBack={() => router.back()} />

      <Text style={[type.onboardingTitle, { color: ink.full, marginTop: 26 }]}>
        Fund the wallet
      </Text>
      <Text style={[type.body, { color: ink.i40, marginTop: 10 }]}>
        The bot can only trade what has settled. You can top up or withdraw whenever you like.
      </Text>

      <Text style={[type.heroAmount, { color: ink.full, textAlign: 'center', marginTop: 26 }]}>
        {money(dep, { fractionDigits: 0 })}
      </Text>

      <PillRow style={{ marginTop: 18, flexGrow: 0 }} contentStyle={{ justifyContent: 'center' }}>
        {PRESETS.map((p) => (
          <Pill
            key={p}
            label={money(p, { fractionDigits: 0 })}
            selected={p === dep}
            onPress={() => setDep(p)}
          />
        ))}
      </PillRow>

      <Text style={[type.eyebrowSm, { color: ink.i32, marginTop: 26 }]}>How you are paying</Text>

      <Screen.Content style={{ marginTop: 12 }}>
        <View style={{ gap: 10 }}>
          {METHODS.map((opt, i) => {
            const selected = i === method;
            return (
              <Pressable
                key={opt.name}
                onPress={() => setMethod(i)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${opt.name}, ${opt.detail}`}
                style={({ pressed }) => ({
                  backgroundColor: surfaces.surface,
                  borderRadius: radius.xl,
                  padding: 16,
                  borderWidth: selected ? 1 : hairlineWidth,
                  borderColor: selected ? borders.selected : borders.card,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: selected ? 0 : 1.5,
                    borderColor: borders.radioUnselected,
                  }}
                >
                  {selected ? (
                    <View
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        borderWidth: 6,
                        borderColor: ink.full,
                      }}
                    />
                  ) : null}
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={[type.rowPrimary, { color: ink.full }]}>{opt.name}</Text>
                  <Text style={[type.secondary, { color: ink.i38 }]}>{opt.detail}</Text>
                </View>
                <View
                  style={{
                    backgroundColor: surfaces.surfaceAlt,
                    borderRadius: radius.xs2,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                  }}
                >
                  <Text style={[type.tagSm, { color: ink.i55 }]}>{opt.tag}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={{ marginTop: 16 }}>
          <Row primary="Fee" value={fee === 0 ? 'Free' : money(fee)} height={48} />
          <Row primary="Available" value={m.lands()} height={48} divider={false} />
        </View>
      </Screen.Content>

      <Button
        label={`Deposit ${money(dep, { fractionDigits: 0 })}`}
        onPress={() => router.push('/delegate')}
      />
    </Screen>
  );
}
