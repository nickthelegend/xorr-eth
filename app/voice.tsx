/**
 * How the bot talks, with the difference shown rather than described.
 *
 * The tone control lives in Settings as three radio labels — "Dry", "Sharp", "Flat" — which asks
 * someone to pick a register from an adjective. The instruction behind each is real and specific
 * and goes into every system prompt; showing it turns the choice into an informed one.
 *
 * What is NOT shown is a sample reply. Generating one per tone would mean four model calls to
 * illustrate a setting, and writing them by hand would put words in the agent's mouth that it never
 * said — the exact thing the voice rules exist to prevent. The instruction is the honest artefact.
 */
import React from 'react';
import { ScrollView, View } from 'react-native';
import { useGoBack } from '@/nav/useGoBack';
import {
  Fill,
  HeaderBar,
  Press,
  Screen,
  SheetCard,
  Text,
  colors,
  radius,
  space,
} from '@/ui';
import { TONES, useTone } from '@/bot/tone';

export default function Voice() {
  const goBack = useGoBack();
  const { tone, setTone } = useTone();

  return (
    <Screen gutter="none">
      <View style={{ paddingHorizontal: space.gutter }}>
        <HeaderBar onBack={goBack} title={<Text variant="screenTitle">Voice</Text>} />
        <Text variant="secondary" color={colors.ink40} style={{ marginTop: space.s8 }}>
          Every reply is written under one of these. The rules about numbers do not change.
        </Text>
      </View>

      <Fill style={{ marginTop: space.s16, paddingHorizontal: space.gutter }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: space.s30, gap: space.s10 }}
        >
          {TONES.map((t) => {
            const on = t.id === tone;
            return (
              <Press
                key={t.id}
                onPress={() => setTone(t.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${t.label}. ${t.description}`}
              >
                <SheetCard
                  bordered
                  borderRadius={radius.panel}
                  padding={space.s16}
                  style={on ? { borderColor: colors.ink30 } : undefined}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                    }}
                  >
                    <Text variant="rowPrimaryLg" color={on ? colors.ink : colors.ink65}>
                      {t.label}
                    </Text>
                    {on ? (
                      <Text variant="control" color={colors.ink55}>
                        In use
                      </Text>
                    ) : null}
                  </View>

                  <Text variant="secondary" color={colors.ink65} style={{ marginTop: space.s8 }}>
                    {t.description}
                  </Text>

                  {/*
                    The actual instruction, verbatim. This is what the model is told, and a person
                    choosing a register deserves to read it rather than infer it from an adjective.
                  */}
                  <Text variant="footnote" color={colors.ink28} style={{ marginTop: space.s12 }}>
                    {t.instruction}
                  </Text>
                </SheetCard>
              </Press>
            );
          })}

          <SheetCard bordered borderRadius={radius.panel} padding={space.s14}>
            <Text variant="secondarySm" color={colors.ink40}>
              None of these loosen the rules that matter. Whatever the tone, a reply that contains a
              figure is rejected before it reaches the screen — every number you see is rendered by
              the app from its own records.
            </Text>
          </SheetCard>
        </ScrollView>
      </Fill>
    </Screen>
  );
}
