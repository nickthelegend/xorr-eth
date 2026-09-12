/**
 * Funding — who is paying whom across the busiest futures contracts (2026-09-13).
 *
 * The contract screen shows one market. Funding is a cross-sectional signal — it says which side of
 * the market is crowded — and reading it one contract at a time is how you miss that everything is
 * paying longs at once.
 *
 * The rates are Hyperliquid's, paid every hour. This screen used to spend a paragraph explaining why
 * every column was a dash or a zero by construction; there is a venue behind it now, so it shows the
 * rate. Neutral ink throughout: funding is a cost of holding a side, not a profit or a loss.
 */
import React, { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useGoBack } from '@/nav/useGoBack';
import {
  ErrorState,
  Fill,
  HeaderBar,
  LoadingRows,
  Price,
  Row,
  Screen,
  Text,
  colors,
  size,
  space,
} from '@/ui';
import { percent, price as fmtPrice } from '@/format';
import { useAsync } from '@/data/useAsync';
import { repos } from '@/data';

/** The busiest contracts — where funding says the most about positioning. */
const ROWS = 20;
const HOURS_PER_YEAR = 24 * 365;

export default function Funding() {
  const goBack = useGoBack();
  const router = useRouter();
  const { data, loading, error, reload } = useAsync(() => repos.perps.markets(), []);
  const rows = useMemo(() => (data?.markets ?? []).slice(0, ROWS), [data]);

  return (
    <Screen gutter="none">
      <View style={{ paddingHorizontal: space.gutter }}>
        <HeaderBar onBack={goBack} title={<Text variant="screenTitle">Funding</Text>} />
        <Text variant="secondary" color={colors.ink40} style={{ marginTop: space.s8 }}>
          Paid every hour. Positive means longs pay shorts.
        </Text>
      </View>

      <Fill style={{ marginTop: space.s12, paddingHorizontal: space.gutter }}>
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : loading && !data ? (
          <LoadingRows count={8} height={size.rowLg} />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.s30 }}>
            {rows.map((m, i) => (
              <Row
                key={m.symbol}
                height={size.rowLg}
                divider={i < rows.length - 1}
                onPress={() => router.push(`/perp/${m.symbol}`)}
                title={m.symbol}
                secondary={fmtPrice(m.markPx)}
                value={
                  <Price variant="rowPrimary">
                    {`${percent(m.fundingRate * 100, { digits: 4, explicitSign: true })} / h`}
                  </Price>
                }
                delta={`${percent(m.fundingRate * 100 * HOURS_PER_YEAR, { digits: 1, explicitSign: true })} a year`}
              />
            ))}
            <Text variant="footnote" color={colors.ink28} style={{ marginTop: space.s14 }}>
              {`Rates from ${data?.venue ?? 'the venue'}. xorr does not trade futures.`}
            </Text>
          </ScrollView>
        )}
      </Fill>
    </Screen>
  );
}
