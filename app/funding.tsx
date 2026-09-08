/**
 * Funding and mark-versus-oracle across every perp the app prices.
 *
 * The perp screen shows one symbol. Funding is a cross-sectional signal — it says which side of the
 * market is crowded — and reading it one instrument at a time is how you miss that everything is
 * paying longs at once.
 *
 * Nulls are rendered as dashes and never as zero. Open interest and funding need a venue's own book
 * and xorr does not run one; a plausible number in that column is the kind a perp trader would act
 * on, which is the reason the repository returns null rather than a default.
 */
import React from 'react';
import { ScrollView, View } from 'react-native';
import { useGoBack } from '@/nav/useGoBack';
import {
  EmptyState,
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
import { percent, price as fmtPrice } from '@/format';
import { useAsync } from '@/data/useAsync';
import { repos } from '@/data';

/** The symbols this build carries perp metrics for. */
const PERPS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE'] as const;

export default function Funding() {
  const goBack = useGoBack();
  const { data, loading } = useAsync(
    async () =>
      Promise.all(
        PERPS.map(async (s) => ({ symbol: s, m: await repos.perps.metrics(s).catch(() => null) })),
      ),
    [],
  );

  const rows = (data ?? []).filter((r) => r.m !== null);

  return (
    <Screen gutter="none">
      <View style={{ paddingHorizontal: space.gutter }}>
        <HeaderBar onBack={goBack} title={<Text variant="screenTitle">Funding</Text>} />
        <Text variant="secondary" color={colors.ink40} style={{ marginTop: space.s8 }}>
          Mark against oracle, across the perps this build prices.
        </Text>
      </View>

      <Fill style={{ marginTop: space.s16, paddingHorizontal: space.gutter }}>
        {loading && !data ? (
          <LoadingRows count={5} height={size.rowLg} />
        ) : rows.length === 0 ? (
          <EmptyState text="No perp metrics are available on this build." />
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: space.s30, gap: space.s10 }}
          >
            {rows.map(({ symbol, m }) => (
              <SheetCard key={symbol} bordered borderRadius={radius.panel} padding={space.s14}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                  }}
                >
                  <Text variant="rowPrimary">{symbol}</Text>
                  <Text variant="rowPrimary">{fmtPrice(m!.markPx)}</Text>
                </View>

                <View style={{ flexDirection: 'row', gap: space.s20, marginTop: space.s12 }}>
                  <Cell
                    label="Mark vs index"
                    value={percent(m!.markVsIndex, { digits: 3 })}
                  />
                  {/*
                    A dash, not a zero. Funding needs a venue's book and this app does not run one —
                    a zero here would read as "flat funding", which is a tradeable claim.
                  */}
                  <Cell
                    label="Funding"
                    value={
                      m!.fundingRate === null
                        ? '—'
                        : percent(m!.fundingRate * 100, { digits: 4 })
                    }
                  />
                  <Cell label="Max lev" value={`${m!.maxLeverage}x`} />
                </View>
              </SheetCard>
            ))}

            <Text variant="footnote" color={colors.ink28} style={{ marginTop: space.s6 }}>
              Open interest, day volume and funding need a venue&apos;s own order book. This app
              does not run one, so those read as dashes rather than plausible numbers.
            </Text>
          </ScrollView>
        )}
      </Fill>
    </Screen>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: space.s2 }}>
      <Text variant="footnote" color={colors.ink40}>
        {label}
      </Text>
      <Text variant="secondarySm">{value}</Text>
    </View>
  );
}
