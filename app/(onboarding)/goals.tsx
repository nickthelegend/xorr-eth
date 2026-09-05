/**
 * Screen 7 — Goals & risk. screens.md Group A.
 *
 * Back circle + 4px progress track + step counter. Title 26/700 two lines. Subtitle.
 * Wrapping chip row (gap 9, chips 40 tall, radius 22). A drawdown question with a 3-up segmented
 * (42px thumbs); the caption reacts to the pick. flex:1. Summary line above a white Continue.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, ChoiceChip, PillWrap, Screen, Segmented } from '@/design/components';
import { ink } from '@/design/colors';
import { type } from '@/design/type';
import { onboarding } from '@/data/fixtures/onboarding';
import { useStore } from '@/state/store';
import { Progress } from '@/design/components/Progress';

export default function Goals() {
  const router = useRouter();
  const goals = useStore((s) => s.goals);
  const toggleGoal = useStore((s) => s.toggleGoal);
  const riskQ = useStore((s) => s.riskQ);
  const setRiskQ = useStore((s) => s.setRiskQ);
  const risk = onboarding.riskLevels[riskQ] ?? 'Balanced';

  return (
    <Screen>
      <Progress step={1} total={3} onBack={() => router.back()} />

      <Text style={[type.onboardingTitle, { color: ink.full, marginTop: 26 }]}>
        {'What should your\nbot optimise for?'}
      </Text>
      <Text style={[type.body, { color: ink.i40, marginTop: 10 }]}>
        Pick as many as apply. This sets the strategies you get offered, and the hard limits they
        run inside.
      </Text>

      <View style={{ marginTop: 20 }}>
        <PillWrap>
          {onboarding.goals.map((g) => (
            <ChoiceChip
              key={g}
              label={g}
              selected={goals.includes(g)}
              onPress={() => toggleGoal(g)}
            />
          ))}
        </PillWrap>
      </View>

      <Text style={[type.cardTitleSm, { color: ink.full, marginTop: 30 }]}>
        How much drawdown can you sit through?
      </Text>
      <Segmented
        options={onboarding.riskLevels}
        value={riskQ}
        onChange={setRiskQ}
        height={42}
        style={{ marginTop: 14 }}
        accessibilityLabel="Drawdown tolerance"
      />
      <Text style={[type.secondaryMd, { color: ink.i40, marginTop: 12 }]}>
        {risk} caps single-position size and how far a stop can sit from entry.
      </Text>

      <Screen.Content />

      <Text style={[type.footnote, { color: ink.i28, marginBottom: 12 }]}>
        {goals.length} selected · {risk}
      </Text>
      <Button
        label="Continue"
        disabled={goals.length === 0}
        onPress={() => router.push('/wallet')}
      />
    </Screen>
  );
}
