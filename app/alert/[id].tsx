/**
 * One alert: whether it is armed, and what it has actually done.
 *
 * The list shows a switch. `armed` and `fireCount` are the two fields it cannot fit, and they are
 * the interesting ones — an alert that has fired is still ON, and telling someone it is simply "on"
 * hides the fact that it already went off and will not go again until the condition clears.
 *
 * An alert that has never fired is stated as such rather than shown as a zero. Zero firings and no
 * record of firings look the same in a counter and mean different things on an older executor that
 * did not send the field.
 */
import React from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useGoBack } from '@/nav/useGoBack';
import {
  ErrorState,
  Fill,
  HeaderBar,
  Placeholder,
  Screen,
  SheetCard,
  Text,
  colors,
  radius,
  space,
} from '@/ui';
import { useAsync } from '@/data/useAsync';
import { repos } from '@/data';

export default function AlertDetail() {
  const goBack = useGoBack();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, error, reload } = useAsync(() => repos.alerts.list(), []);
  const alert = (data ?? []).find((a) => a.id === id);

  return (
    <Screen gutter="none">
      <View style={{ paddingHorizontal: space.gutter }}>
        <HeaderBar onBack={goBack} title={<Text variant="screenTitle">Alert</Text>} />
      </View>

      <Fill style={{ marginTop: space.s16, paddingHorizontal: space.gutter }}>
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : loading && !data ? (
          <Placeholder height={150} />
        ) : !alert ? (
          <Text variant="body" color={colors.ink40}>
            No alert with that id.
          </Text>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: space.s30, gap: space.s10 }}
          >
            <SheetCard bordered borderRadius={radius.panel} padding={space.s18}>
              <Text variant="footnote" color={colors.ink40}>
                {alert.armed === false ? 'FIRED, WAITING TO RESET' : 'WATCHING'}
              </Text>
              <Text variant="screenTitle" style={{ marginTop: space.s6 }}>
                {alert.name}
              </Text>
              <Text variant="secondary" color={colors.ink65} style={{ marginTop: space.s10 }}>
                {alert.detail}
              </Text>
              {alert.armed === false ? (
                <Text variant="secondarySm" color={colors.warn} style={{ marginTop: space.s10 }}>
                  {/*
                    The fact the switch cannot express. It is still on and it will not fire again
                    until the condition clears, which is not what "on" suggests.
                  */}
                  This has already gone off. It stays quiet until the condition clears, then arms
                  itself again.
                </Text>
              ) : null}
            </SheetCard>

            <SheetCard bordered borderRadius={radius.panel} padding={space.s16}>
              <Text variant="footnote" color={colors.ink40}>
                HISTORY
              </Text>
              <Text variant="rowPrimary" style={{ marginTop: space.s6 }}>
                {alert.fireCount === undefined
                  ? 'Not recorded on this executor'
                  : alert.fireCount === 0
                    ? 'Has never fired'
                    : alert.fireCount === 1
                      ? 'Fired once'
                      : `Fired ${alert.fireCount} times`}
              </Text>
              {alert.lastFiredAt ? (
                <Text variant="secondarySm" color={colors.ink40} style={{ marginTop: space.s8 }}>
                  Last {new Date(alert.lastFiredAt).toLocaleString('en-US')}
                </Text>
              ) : null}
            </SheetCard>
          </ScrollView>
        )}
      </Fill>
    </Screen>
  );
}
