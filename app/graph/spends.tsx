/**
 * Spends as the subgraph indexed them, not as our database recorded them.
 *
 * That distinction is the entire point of the screen. `/activity` is our own trail — hash-chained
 * and honest, but ours. This is the same money movement reconstructed from `Spend` events the
 * contract emitted, indexed by someone else's infrastructure. Two independent records of the same
 * facts is what makes either one worth trusting.
 *
 * Amounts are raw token units as strings, because they are `BigInt` in GraphQL and JSON has no such
 * thing. USDC is six decimals, so they are divided by that and labelled — anything else here would
 * be a guess about a token this screen does not resolve.
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
  Screen,
  SheetCard,
  Text,
  colors,
  radius,
  size,
  space,
} from '@/ui';
import { money, shortAddress } from '@/format';
import { useAsync } from '@/data/useAsync';
import { system, type GraphSpend } from '@/data/system';

/** The settlement token's decimals. Every `Spend` is denominated in it. */
const USDC_DECIMALS = 6;

function usd(raw: string): string {
  const n = Number(raw) / 10 ** USDC_DECIMALS;
  return Number.isFinite(n) ? money(n) : raw;
}

export default function GraphSpends() {
  const goBack = useGoBack();
  const { data, loading, error, reload } = useAsync(() => system.graphActivity(), []);

  const spends = data?.spends ?? [];
  const daily = data?.daily ?? [];

  return (
    <Screen gutter="none">
      <View style={{ paddingHorizontal: space.gutter }}>
        <HeaderBar onBack={goBack} title={<Text variant="screenTitle">Spend events</Text>} />
        <Text variant="secondary" color={colors.ink40} style={{ marginTop: space.s8 }}>
          Reconstructed from what the contract emitted, indexed by The Graph — a second record of
          the same money, kept by someone other than us.
        </Text>
      </View>

      <Fill style={{ marginTop: space.s16 }}>
        {error ? (
          <View style={{ paddingHorizontal: space.gutter }}>
            <ErrorState error={error} onRetry={reload} />
          </View>
        ) : loading && !data ? (
          <View style={{ paddingHorizontal: space.gutter }}>
            <LoadingRows count={6} height={size.row} />
          </View>
        ) : spends.length === 0 ? (
          <EmptyState text="The subgraph has indexed no spends for this wallet." />
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: space.gutter,
              paddingBottom: space.s30,
              gap: space.s10,
            }}
          >
            {daily.length > 0 ? (
              <SheetCard bordered borderRadius={radius.panel} padding={space.s14}>
                <Text variant="footnote" color={colors.ink40}>
                  BY DAY
                </Text>
                {daily.slice(0, 7).map((d) => (
                  <View
                    key={d.day}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      marginTop: space.s8,
                    }}
                  >
                    <Text variant="secondarySm" color={colors.ink65}>
                      {d.day}
                    </Text>
                    <Text variant="secondarySm">
                      {usd(d.total)} · {d.tradeCount}
                    </Text>
                  </View>
                ))}
              </SheetCard>
            ) : null}

            {spends.map((s) => (
              <SpendRow key={s.id} spend={s} />
            ))}
          </ScrollView>
        )}
      </Fill>
    </Screen>
  );
}

function SpendRow({ spend }: { spend: GraphSpend }) {
  return (
    <SheetCard bordered borderRadius={radius.panel} padding={space.s14}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text variant="rowPrimary">{usd(spend.amount)}</Text>
        <Text variant="footnote" color={colors.ink40}>
          {new Date(Number(spend.timestamp) * 1000).toLocaleString('en-US')}
        </Text>
      </View>
      <Text variant="secondarySm" color={colors.ink40} style={{ marginTop: space.s6 }}>
        venue {shortAddress(spend.venue)} · token {shortAddress(spend.token)}
      </Text>
      {/*
        The transaction hash, in full. This is the thing a reader takes to an explorer, and an
        ellipsis in the middle of it makes it useless for that.
      */}
      <Text variant="footnoteSm" color={colors.ink28} style={{ marginTop: space.s6 }}>
        {spend.txHash}
      </Text>
    </SheetCard>
  );
}
