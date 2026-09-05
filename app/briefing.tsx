/**
 * Screen 23 — News, with agent takes. screens.md Group D.
 *
 * "Briefing" + "Updated Nm ago". Three cards: a class tag chip + relative time, headline 15/600,
 * then a hairline-separated agent take (8px `up` dot + 11.5/1.5 body).
 * Ghost "Ask for the full rundown" -> routes into Bot chat.
 *
 * PLAN.md 8.6: this is the "trades while you chill" payoff surface — what the user reads when
 * they come back after a week. Treated as a headline feature, not a leaf screen.
 */
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Button,
  ErrorState,
  LoadingRows,
  Screen,
  ScreenHeader,
  SheetCard,
} from '@/design/components';
import { borders, ink, pnl } from '@/design/colors';
import { hairlineWidth, radius } from '@/design/space';
import { type } from '@/design/type';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';

export default function Briefing() {
  const router = useRouter();
  const { data, loading, error, reload } = useAsync(() => repos.news.briefing(), []);

  return (
    <Screen>
      <ScreenHeader
        left={<Text style={[type.screenTitle, { color: ink.full }]}>Briefing</Text>}
        right={<Text style={[type.footnote, { color: ink.i28 }]}>Updated 18m ago</Text>}
      />
      <Text style={[type.secondary, { color: ink.i40, marginTop: 10 }]}>
        Only what moved your book, and what each agent did about it.
      </Text>

      <Screen.Content style={{ marginTop: 18 }}>
        {loading && !data ? (
          <LoadingRows count={3} height={110} />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
            {(data ?? []).map((n) => (
              <SheetCard key={n.id} radius={radius.xl} padding={16}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View
                    style={{
                      backgroundColor: n.tagBg,
                      borderRadius: radius.xs2,
                      paddingHorizontal: 7,
                      paddingVertical: 3,
                    }}
                  >
                    <Text style={[type.tagSm, { color: n.tagFg }]}>{n.tag}</Text>
                  </View>
                  <Text style={[type.footnote, { color: ink.i28 }]}>{n.t}</Text>
                </View>

                <Text style={[type.rowPrimaryLg, { color: ink.full, marginTop: 12 }]}>
                  {n.headline}
                </Text>

                <View
                  style={{
                    flexDirection: 'row',
                    gap: 10,
                    marginTop: 14,
                    paddingTop: 14,
                    borderTopWidth: hairlineWidth,
                    borderTopColor: borders.hairline,
                  }}
                >
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: pnl.up,
                      marginTop: 4,
                    }}
                  />
                  <Text style={[type.noteBody, { color: ink.i45, flex: 1 }]}>{n.take}</Text>
                </View>
              </SheetCard>
            ))}
          </ScrollView>
        )}
      </Screen.Content>

      <Button
        label="Ask for the full rundown"
        variant="ghost"
        onPress={() => router.push('/bot')}
        style={{ marginTop: 14 }}
      />
    </Screen>
  );
}
