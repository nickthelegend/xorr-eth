/**
 * The same asset, priced by two independent sources.
 *
 * The asset screen already runs this check and shows a line only when the two DISAGREE, which is
 * the right default — a note saying "two sources agree" on every asset every day is noise that
 * trains people to stop reading. But it means the agreement is never visible, and "these numbers
 * were checked against something" is worth being able to confirm on purpose.
 *
 * `compared: false` is its own state and not a disagreement. One source being unreachable tells you
 * nothing about the other, and painting an outage as a price discrepancy would send someone looking
 * for a problem in the wrong place.
 */
import React from 'react';
import { View } from 'react-native';
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
import { percent, price as fmtPrice } from '@/format';
import { useAsync } from '@/data/useAsync';
import { system } from '@/data/system';

export default function Crosscheck() {
  const goBack = useGoBack();
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const { data, loading, error, reload } = useAsync(
    () => system.crosscheck(symbol!),
    [symbol],
  );

  const state = !data
    ? null
    : !data.compared
      ? { label: 'Only one source answered', tone: colors.ink40 }
      : data.agree
        ? { label: 'They agree', tone: colors.up }
        : { label: 'They disagree', tone: colors.warn };

  return (
    <Screen>
      <HeaderBar onBack={goBack} title={<Text variant="screenTitle">{symbol}</Text>} />

      <Fill style={{ marginTop: space.s20, gap: space.s12 }}>
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : loading && !data ? (
          <Placeholder height={160} />
        ) : !data || !state ? null : (
          <>
            <SheetCard bordered borderRadius={radius.panel} padding={space.s18}>
              <Text variant="footnote" color={colors.ink40}>
                CROSS-CHECK
              </Text>
              <Text variant="screenTitle" color={state.tone} style={{ marginTop: space.s6 }}>
                {state.label}
              </Text>
              <Text variant="secondary" color={colors.ink65} style={{ marginTop: space.s10 }}>
                {data.note}
              </Text>
            </SheetCard>

            <View style={{ flexDirection: 'row', gap: space.s10 }}>
              <Source label="1inch" note="the pools a fill would touch" value={data.oneinch} />
              <Source label="CoinGecko" note="the reference price" value={data.coingecko} />
            </View>

            {/*
              The gap, when there is one to measure. Rendered only when both sides exist — a
              percentage computed against a missing number is not a small discrepancy, it is a
              fabricated one.
            */}
            {data.compared && data.spreadPct !== null && data.spreadPct !== undefined ? (
              <SheetCard bordered borderRadius={radius.panel} padding={space.s14}>
                <Text variant="footnote" color={colors.ink40}>
                  DIFFERENCE
                </Text>
                <Text variant="rowPrimary" style={{ marginTop: space.s4 }}>
                  {percent(Math.abs(data.spreadPct), { digits: 2, explicitSign: false })}
                </Text>
                <Text variant="secondarySm" color={colors.ink40} style={{ marginTop: space.s8 }}>
                  The executor fills at the 1inch side. Where they diverge, that is the number that
                  decides what you actually pay.
                </Text>
              </SheetCard>
            ) : null}
          </>
        )}
      </Fill>
    </Screen>
  );
}

function Source({ label, note, value }: { label: string; note: string; value: number | null }) {
  return (
    <SheetCard bordered borderRadius={radius.panel} padding={space.s14} style={{ flex: 1 }}>
      <Text variant="footnote" color={colors.ink40}>
        {label}
      </Text>
      {/*
        A dash for null, never a zero. Zero is a price; "we could not reach it" is not.
      */}
      <Text
        variant="rowPrimaryLg"
        color={value === null ? colors.ink40 : colors.ink}
        style={{ marginTop: space.s6 }}
      >
        {value === null ? '—' : fmtPrice(value)}
      </Text>
      <Text variant="footnote" color={colors.ink28} style={{ marginTop: space.s6 }}>
        {note}
      </Text>
    </SheetCard>
  );
}
