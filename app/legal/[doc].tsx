/**
 * Legal documents — PLAN.md 14.3 [G38].
 *
 * The app runs autonomous strategies against real capital; the in-screen footnotes are not
 * sufficient on their own. These are drafted to be honest and specific, and they are explicitly
 * NOT legal advice: task 14.2 still requires counsel on the non-custodial posture before launch.
 */
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { IconButton, NoteStrip, Screen, ScreenHeader } from '@/design/components';
import { ink } from '@/design/colors';
import { type } from '@/design/type';
import { LEGAL } from '@/legal/documents';

export default function LegalDoc() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const router = useRouter();
  const entry = LEGAL[doc ?? 'terms'] ?? LEGAL.terms!;

  return (
    <Screen>
      <ScreenHeader
        left={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <IconButton
              name="back"
              accessibilityLabel="Back"
              background="transparent"
              color={ink.i55}
              onPress={() => router.back()}
            />
            <Text style={[type.screenTitle, { color: ink.full }]}>{entry.title}</Text>
          </View>
        }
      />

      <Screen.Content style={{ marginTop: 18 }}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={[type.footnote, { color: ink.i28 }]}>{entry.updated}</Text>
          {entry.sections.map((s) => (
            <View key={s.heading} style={{ marginTop: 22, gap: 8 }}>
              <Text style={[type.cardTitleSm, { color: ink.full }]}>{s.heading}</Text>
              {s.paragraphs.map((p, i) => (
                <Text key={i} style={[type.body, { color: ink.i45, lineHeight: 14 * 1.6 }]}>
                  {p}
                </Text>
              ))}
            </View>
          ))}
          <NoteStrip kind="risk" style={{ marginTop: 24, marginBottom: 30 }}>
            {entry.footer}
          </NoteStrip>
        </ScrollView>
      </Screen.Content>
    </Screen>
  );
}
