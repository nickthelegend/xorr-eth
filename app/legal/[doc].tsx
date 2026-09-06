/**
 * Legal documents — PLAN.md 14.3 [G38].
 *
 * The app runs autonomous strategies against real capital; the in-screen footnotes are not
 * sufficient on their own. These are drafted to be honest and specific, and they are
 * explicitly NOT legal advice: task 14.2 still requires counsel on the non-custodial
 * posture before launch.
 */
import React from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Fill,
  IconButton,
  NoteStrip,
  Screen,
  Text,
  colors,
  space,
} from '@/ui';
import { LEGAL } from '@/legal/documents';

export default function LegalDoc() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const router = useRouter();
  const entry = LEGAL[doc ?? 'terms'] ?? LEGAL.terms!;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s8 }}>
        <IconButton
          name="back"
          accessibilityLabel="Back"
          background="none"
          onPress={() => router.back()}
        />
        <Text variant="screenTitle" numberOfLines={1} style={{ flex: 1 }}>
          {entry.title}
        </Text>
      </View>

      <Fill style={{ marginTop: space.s18 }}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text variant="footnote" color={colors.ink28}>
            {entry.updated}
          </Text>
          {entry.sections.map((s) => (
            <View key={s.heading} style={{ marginTop: space.s22, gap: space.s8 }}>
              <Text variant="cardTitle">{s.heading}</Text>
              {s.paragraphs.map((p, i) => (
                // Legal prose is read in long passes, so it takes a looser leading than the
                // body variant's 1.5 — the one place in the app that is the right call.
                <Text key={i} variant="body" color={colors.ink45} style={{ lineHeight: 14 * 1.6 }}>
                  {p}
                </Text>
              ))}
            </View>
          ))}
          <NoteStrip kind="risk" style={{ marginTop: space.s26, marginBottom: space.s30 }}>
            {entry.footer}
          </NoteStrip>
        </ScrollView>
      </Fill>
    </Screen>
  );
}
