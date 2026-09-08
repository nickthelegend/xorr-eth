/**
 * What the delegation has spent, day by day, as the chain recorded it.
 *
 * `/limits` answers "how much is left today". This answers "how much does it usually use", which is
 * the question that tells you whether the cap is doing anything — a cap of two thousand against
 * days that never exceed three hundred is a control that has never once bound.
 *
 * From the subgraph's `dailySpends`, so these are totals the contract emitted rather than our own
 * tally of what we asked it to do.
 */
import React, { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { useGoBack } from '@/nav/useGoBack';
import {
  EmptyState,
  ErrorState,
  Fill,
  HeaderBar,
  LoadingRows,
  Screen,
  Text,
  colors,
  size,
  space,
} from '@/ui';
import { money } from '@/format';
import { useAsync } from '@/data/useAsync';
import { system } from '@/data/system';

const USDC_DECIMALS = 6;
const BAR_H = 8;

export default function Spend() {
  const goBack = useGoBack();
  const { data, loading, error, reload } = useAsync(() => system.graphActivity(), []);

  const days = useMemo(
    () =>
      (data?.daily ?? []).map((d) => ({
        day: d.day,
        usd: Number(d.total) / 10 ** USDC_DECIMALS,
        trades: Number(d.tradeCount),
      })),
    [data],
  );

  /* Scaled to the busiest day, so the bars compare to each other rather than to a cap that may
     have changed since. */
  const peak = useMemo(() => days.reduce((m, d) => Math.max(m, d.usd), 0), [days]);

  return (
    <Screen gutter="none">
      <View style={{ paddingHorizontal: space.gutter }}>
        <HeaderBar onBack={goBack} title={<Text variant="screenTitle">Spend</Text>} />
        <Text variant="secondary" color={colors.ink40} style={{ marginTop: space.s8 }}>
          Day by day, from what the contract emitted.
        </Text>
      </View>

      <Fill style={{ marginTop: space.s16, paddingHorizontal: space.gutter }}>
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : loading && !data ? (
          <LoadingRows count={6} height={size.row} />
        ) : days.length === 0 ? (
          <EmptyState text="The subgraph has indexed no spending for this wallet." />
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: space.s30 }}
          >
            {days.map((d) => (
              <View key={d.day} style={{ marginTop: space.s16 }}>
                <View
                  style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}
                >
                  <Text variant="rowPrimary">{d.day}</Text>
                  <Text variant="rowPrimary">{money(d.usd)}</Text>
                </View>
                <View
                  style={{
                    height: BAR_H,
                    borderRadius: BAR_H / 2,
                    backgroundColor: colors.control,
                    marginTop: space.s8,
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      width: `${peak > 0 ? (d.usd / peak) * 100 : 0}%`,
                      height: '100%',
                      borderRadius: BAR_H / 2,
                      backgroundColor: colors.ink,
                    }}
                  />
                </View>
                <Text variant="footnote" color={colors.ink28} style={{ marginTop: space.s6 }}>
                  {d.trades === 1 ? 'one trade' : `${d.trades} trades`}
                </Text>
              </View>
            ))}
          </ScrollView>
        )}
      </Fill>
    </Screen>
  );
}
