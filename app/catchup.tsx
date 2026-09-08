/**
 * What happened while you were not looking.
 *
 * The executor already tracks `last_seen_at` per wallet and can answer "everything since then" —
 * it is what the briefing is built on. What it did not have was a screen that treats *since you
 * last looked* as the unit, rather than *today* or *the last fifty rows*.
 *
 * That distinction matters for a bot that trades unattended. "Four trades today" is not the
 * question someone opening the app after a week is asking.
 *
 * The counts lead, because the shape of what happened is absorbable in a second and twelve rows of
 * detail is not. The rows are underneath for whoever wants them.
 */
import React from 'react';
import { ScrollView, View } from 'react-native';
import { useGoBack } from '@/nav/useGoBack';
import {
  Button,
  EmptyState,
  ErrorState,
  Fill,
  HeaderBar,
  LoadingRows,
  Screen,
  SheetCard,
  Text,
  colors,
  radius,
  size,
  space,
} from '@/ui';
import { useAsync } from '@/data/useAsync';
import { system } from '@/data/system';

export default function Catchup() {
  const goBack = useGoBack();
  const { data, loading, error, reload } = useAsync(() => system.catchup(), []);
  const [acknowledged, setAcknowledged] = React.useState(false);

  const entries = data?.entries ?? [];
  const counts = Object.entries(data?.counts ?? {});

  return (
    <Screen gutter="none">
      <View style={{ paddingHorizontal: space.gutter }}>
        <HeaderBar onBack={goBack} title={<Text variant="screenTitle">Since you looked</Text>} />
        {data ? (
          <Text variant="secondary" color={colors.ink40} style={{ marginTop: space.s8 }}>
            {data.isFirstVisit
              ? 'First visit — this is everything from the last day.'
              : data.since
                ? `Since ${new Date(data.since).toLocaleString('en-US')}.`
                : 'Since the beginning.'}
          </Text>
        ) : null}
      </View>

      <Fill style={{ marginTop: space.s16 }}>
        {error ? (
          <View style={{ paddingHorizontal: space.gutter }}>
            <ErrorState error={error} onRetry={reload} />
          </View>
        ) : loading && !data ? (
          <View style={{ paddingHorizontal: space.gutter }}>
            <LoadingRows count={5} height={size.row} />
          </View>
        ) : entries.length === 0 ? (
          <EmptyState text="Nothing has happened since you last looked." />
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: space.gutter,
              paddingBottom: space.s30,
              gap: space.s10,
            }}
          >
            {counts.length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s20, paddingBottom: space.s10 }}>
                {counts.map(([kind, n]) => (
                  <View key={kind} style={{ gap: space.s2 }}>
                    <Text variant="screenTitle">{String(n)}</Text>
                    <Text variant="footnote" color={colors.ink40}>
                      {kind}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {entries.map((e, i) => (
              <SheetCard key={`${e.at}-${i}`} bordered borderRadius={radius.panel} padding={space.s14}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <Text variant="rowPrimary">{e.action}</Text>
                  <Text variant="footnote" color={colors.ink28}>
                    {new Date(e.at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                <Text variant="secondarySm" color={colors.ink40} style={{ marginTop: space.s6 }}>
                  {e.detail}
                </Text>
              </SheetCard>
            ))}

            {/*
              Acknowledging is explicit and one-way. Marking things seen as a side effect of
              opening the screen means a glance costs you the record of what you had not read.
            */}
            <Button
              label={acknowledged ? 'Marked as seen' : 'Mark all as seen'}
              variant="ghost"
              disabled={acknowledged}
              onPress={() => {
                setAcknowledged(true);
                void system.markCaughtUp();
              }}
            />
          </ScrollView>
        )}
      </Fill>
    </Screen>
  );
}
