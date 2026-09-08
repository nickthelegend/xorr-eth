/**
 * What has actually been made, per symbol, on positions that are closed.
 *
 * Holdings show what a position is worth now. This shows what selling actually returned, which is
 * a different number and the only one that is real — an unrealised gain is a price, and a realised
 * one is money that moved.
 *
 * `basisIncomplete` is surfaced per row rather than hidden. Some of what was sold has no recorded
 * cost, which makes the figure understate the outcome, and a total that quietly includes those
 * rows would be a number nobody could reconcile.
 */
import React from 'react';
import { ScrollView, View } from 'react-native';
import { useGoBack } from '@/nav/useGoBack';
import {
  EmptyState,
  ErrorState,
  Fill,
  HeaderBar,
  LoadingRows,
  Price,
  Row,
  Screen,
  Text,
  colors,
  pnlTone,
  size,
  space,
} from '@/ui';
import { money, quantity, signedMoney } from '@/format';
import { useAsync } from '@/data/useAsync';
import { repos } from '@/data';

export default function Pnl() {
  const goBack = useGoBack();
  const { data, loading, error, reload } = useAsync(() => repos.portfolio.realised(), []);

  const rows = data?.bySymbol ?? [];
  const incomplete = rows.filter((r) => r.basisIncomplete).length;

  return (
    <Screen gutter="none">
      <View style={{ paddingHorizontal: space.gutter }}>
        <HeaderBar onBack={goBack} title={<Text variant="screenTitle">Realised</Text>} />
      </View>

      <Fill style={{ marginTop: space.s16, paddingHorizontal: space.gutter }}>
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : loading && !data ? (
          <LoadingRows count={5} height={size.rowLg} />
        ) : rows.length === 0 ? (
          <EmptyState text="Nothing has been sold yet, so nothing is realised." />
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: space.s30 }}
          >
            <View style={{ paddingBottom: space.s16 }}>
              <Text variant="footnote" color={colors.ink40}>
                TOTAL REALISED
              </Text>
              <Price variant="screenTitle" tone={pnlTone(data!.total)} style={{ marginTop: space.s6 }}>
                {signedMoney(data!.total)}
              </Price>
              {incomplete > 0 ? (
                <Text variant="secondarySm" color={colors.warn} style={{ marginTop: space.s8 }}>
                  {/*
                    Counted, not hand-waved. "Some figures may be incomplete" is the kind of
                    disclaimer that reassures nobody and helps nobody.
                  */}
                  {incomplete === 1
                    ? 'One symbol had a sale with no recorded cost, so this understates the outcome.'
                    : `${incomplete} symbols had sales with no recorded cost, so this understates the outcome.`}
                </Text>
              ) : null}
            </View>

            {rows.map((r) => (
              <Row
                key={r.symbol}
                height={size.rowLg}
                title={r.symbol}
                secondary={`${quantity(r.unitsSold)} sold · ${money(r.proceeds)} back${r.basisIncomplete ? ' · cost incomplete' : ''}`}
                value={
                  <Price variant="rowPrimary" tone={pnlTone(r.realised)}>
                    {signedMoney(r.realised)}
                  </Price>
                }
              />
            ))}
          </ScrollView>
        )}
      </Fill>
    </Screen>
  );
}
