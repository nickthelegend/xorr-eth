/**
 * Where the money actually sits.
 *
 * Holdings is a list ordered by whatever it was ordered by; this is the same money as proportions,
 * which is the only view that answers "am I concentrated" — the question that matters most and that
 * a list of rows cannot answer at a glance.
 *
 * Built from the same `positions()` call Holdings uses, so the two cannot disagree. Bars are drawn
 * from `notional` because that is what the position is worth now, and the percentage under each is
 * derived from the same figure rather than stored separately.
 *
 * Cash is included. A portfolio that is eighty percent cash is a fact about the portfolio, and
 * omitting it would make every other slice look larger than it is.
 */
import React, { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { useGoBack } from '@/nav/useGoBack';
import {
  AssetMark,
  EmptyState,
  ErrorState,
  Fill,
  HeaderBar,
  Placeholder,
  Price,
  Screen,
  Text,
  colors,
  percent as pct,
  size,
  space,
} from '@/ui';
import { assetGradient } from '@/design/gradients';
import { money } from '@/format';
import { useAsync } from '@/data/useAsync';
import { logoProps, useLogos } from '@/data/useLogos';
import { repos } from '@/data';

const BAR_H = 6;

export default function Allocation() {
  const goBack = useGoBack();
  const positions = useAsync(() => repos.portfolio.positions(), []);
  const balance = useAsync(() => repos.portfolio.balance(), []);

  const rows = useMemo(() => {
    const held = (positions.data ?? [])
      .filter((p) => p.notional > 0)
      .map((p) => ({ symbol: p.symbol, usd: p.notional }));
    const cash = balance.data?.cash ?? 0;
    // Cash last, and only when there is some. A zero-width bar labelled "Cash" is noise.
    return cash > 0 ? [...held, { symbol: 'Cash', usd: cash }] : held;
  }, [positions.data, balance.data]);

  const total = useMemo(() => rows.reduce((sum, r) => sum + r.usd, 0), [rows]);
  const symbols = useMemo(() => rows.map((r) => r.symbol), [rows]);
  const logos = useLogos(symbols);

  const error = positions.error ?? balance.error;
  const loading = (positions.loading && !positions.data) || (balance.loading && !balance.data);

  return (
    <Screen gutter="none">
      <View style={{ paddingHorizontal: space.gutter }}>
        <HeaderBar onBack={goBack} title={<Text variant="screenTitle">Allocation</Text>} />
      </View>

      <Fill style={{ marginTop: space.s16, paddingHorizontal: space.gutter }}>
        {error ? (
          <ErrorState error={error} onRetry={positions.reload} />
        ) : loading ? (
          <View style={{ gap: space.s12 }}>
            <Placeholder height={70} />
            <Placeholder height={70} />
            <Placeholder height={70} />
          </View>
        ) : rows.length === 0 || total === 0 ? (
          <EmptyState text="Nothing is held and there is no cash, so there is nothing to divide." />
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: space.s30 }}
          >
            <View style={{ paddingBottom: space.s16 }}>
              <Text variant="footnote" color={colors.ink40}>
                TOTAL
              </Text>
              <Price variant="screenTitle" style={{ marginTop: space.s6 }}>
                {money(total)}
              </Price>
            </View>

            {rows
              .slice()
              .sort((a, b) => b.usd - a.usd)
              .map((r) => {
                const share = r.usd / total;
                return (
                  <View key={r.symbol} style={{ marginTop: space.s16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s10 }}>
                      <AssetMark
                        gradient={assetGradient(r.symbol)}
                        {...logoProps(logos, r.symbol)}
                        size={size.markSm}
                      />
                      <Text variant="rowPrimary" style={{ flex: 1 }}>
                        {r.symbol}
                      </Text>
                      <Price variant="rowPrimary">{money(r.usd)}</Price>
                    </View>

                    {/*
                      Static, and drawn from the same number as the label beside it. A bar whose
                      width came from anywhere other than the figure it sits under is a bar that can
                      disagree with it.
                    */}
                    <View
                      style={{
                        height: BAR_H,
                        borderRadius: BAR_H / 2,
                        backgroundColor: colors.control,
                        marginTop: space.s10,
                        overflow: 'hidden',
                      }}
                    >
                      <View
                        style={{
                          width: `${share * 100}%`,
                          height: '100%',
                          borderRadius: BAR_H / 2,
                          backgroundColor: colors.ink,
                        }}
                      />
                    </View>

                    <Text variant="footnote" color={colors.ink40} style={{ marginTop: space.s6 }}>
                      {pct(share * 100)}
                    </Text>
                  </View>
                );
              })}
          </ScrollView>
        )}
      </Fill>
    </Screen>
  );
}
