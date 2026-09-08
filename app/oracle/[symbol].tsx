/**
 * Every price this deployment has actually recorded for an equity.
 *
 * The tokenized equities have no market-data feed. Their price comes from probing a live 1inch
 * route, and every probe is written to `price_observations` — so the only history that exists for
 * them is the history this executor made by looking. That is a genuinely unusual property and the
 * screen says it rather than presenting the series as though a vendor supplied it.
 *
 * `observedSince` is rendered, always. A chart with eleven points looks like a chart with eleven
 * thousand unless something states when the record began.
 */
import React from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useGoBack } from '@/nav/useGoBack';
import {
  AreaChart,
  EmptyState,
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
import { price as fmtPrice } from '@/format';
import { useAsync } from '@/data/useAsync';
import { system } from '@/data/system';

const CHART_H = 140;

export default function Oracle() {
  const goBack = useGoBack();
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const { data, loading, error, reload } = useAsync(() => system.observed(symbol!), [symbol]);

  const points = data?.points ?? [];
  const series = points.map((p) => p.usd);

  return (
    <Screen gutter="none">
      <View style={{ paddingHorizontal: space.gutter }}>
        <HeaderBar onBack={goBack} title={<Text variant="screenTitle">{symbol}</Text>} />
        <Text variant="secondary" color={colors.ink40} style={{ marginTop: space.s8 }}>
          Readings this executor took, not a vendor&apos;s series.
        </Text>
      </View>

      <Fill style={{ marginTop: space.s16, paddingHorizontal: space.gutter }}>
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : loading && !data ? (
          <Placeholder height={CHART_H} />
        ) : points.length === 0 ? (
          <EmptyState text={data?.note ?? 'No readings yet.'} />
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: space.s30, gap: space.s12 }}
          >
            {series.length > 1 ? (
              <AreaChart data={series} height={CHART_H} color={colors.ink65} endDot />
            ) : null}

            <SheetCard bordered borderRadius={radius.panel} padding={space.s14}>
              {/*
                The provenance line, always. A short series and a long one look identical without
                a statement of when the record started.
              */}
              <Text variant="secondarySm" color={colors.ink65}>
                {data!.note}
              </Text>
            </SheetCard>

            {points
              .slice()
              .reverse()
              .slice(0, 40)
              .map((p) => (
                <View
                  key={p.at}
                  style={{ flexDirection: 'row', justifyContent: 'space-between' }}
                >
                  <Text variant="secondarySm" color={colors.ink40}>
                    {new Date(p.at).toLocaleString('en-US')}
                  </Text>
                  <Text variant="secondarySm">{fmtPrice(p.usd)}</Text>
                </View>
              ))}
          </ScrollView>
        )}
      </Fill>
    </Screen>
  );
}
