/**
 * Which symbols have a price, which can actually be bought, and where those two lists differ.
 *
 * They are different sets and the difference is the whole point. `/market/symbols` is what has a
 * feed; `/market/tradable` is what the executor can settle on this chain. Everything in the first
 * and not the second is a chart you can look at and an order that would never fill — which is the
 * exact bug the tradable route was created to prevent, and nothing showed the gap.
 *
 * Three groups rather than one list with badges. "Priced and settleable", "priced only" and
 * "settleable only" are three different facts and a reader scanning a badge column has to hold all
 * three in their head at once.
 */
import React, { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { useGoBack } from '@/nav/useGoBack';
import {
  ErrorState,
  Eyebrow,
  Fill,
  HeaderBar,
  LoadingRows,
  Screen,
  Text,
  colors,
  divider,
  size,
  space,
} from '@/ui';
import { useAsync } from '@/data/useAsync';
import { system } from '@/data/system';
import { SETTLES_AS, settlementSymbol } from '@/data/tradable';

export default function Coverage() {
  const goBack = useGoBack();
  const symbols = useAsync(() => system.symbols(), []);
  const tradable = useAsync(() => system.tradable(), []);

  const groups = useMemo(() => {
    const priced = new Set(symbols.data ?? []);
    const settles = new Set((tradable.data ?? []).map((t) => t.symbol.toUpperCase()));

    /*
     * Through `settlementSymbol`, not by matching the ticker.
     *
     * This compared raw symbols and told the reader that BTC was "a chart, not an order" — while
     * the app offers a Buy for it, because buying BTC here means buying cbBTC. `SETTLES_AS` exists
     * for exactly that: the market is real and the instrument representing it on this chain has a
     * different ticker. Saying a tradable market cannot be traded is the confidently-wrong answer
     * this screen was built to prevent, and it was the screen giving it.
     */
    const both: { symbol: string; via?: string }[] = [];
    const pricedOnly: string[] = [];
    for (const s of priced) {
      const settled = settlementSymbol(s).toUpperCase();
      if (settles.has(settled)) {
        both.push({ symbol: s, via: SETTLES_AS[s.toUpperCase()] ? settled : undefined });
      } else {
        pricedOnly.push(s);
      }
    }

    /* A settleable token nothing prices, and nothing routes to it as a settlement target either. */
    const reachable = new Set([...priced].map((p) => settlementSymbol(p).toUpperCase()));
    const settlesOnly = (tradable.data ?? [])
      .map((t) => t.symbol)
      .filter((s) => !reachable.has(s.toUpperCase()));

    return {
      both: both.sort((a, b) => a.symbol.localeCompare(b.symbol)),
      pricedOnly: pricedOnly.sort(),
      settlesOnly: settlesOnly.sort(),
    };
  }, [symbols.data, tradable.data]);

  const error = symbols.error ?? tradable.error;
  const loading = (symbols.loading && !symbols.data) || (tradable.loading && !tradable.data);

  const section = (title: string, blurb: string, rows: { symbol: string; via?: string }[]) =>
    rows.length === 0 ? null : (
      <View style={{ marginTop: space.s20 }}>
        <Eyebrow>{title}</Eyebrow>
        <Text variant="footnote" color={colors.ink28} style={{ marginTop: space.s4 }}>
          {blurb}
        </Text>
        {rows.map((r) => (
          <View key={r.symbol} style={[{ paddingVertical: space.s12 }, divider]}>
            <Text variant="rowPrimary">{r.symbol}</Text>
            {/* Named, because "BTC settles" is only true through a token with another ticker. */}
            {r.via ? (
              <Text variant="footnote" color={colors.ink40} style={{ marginTop: space.s2 }}>
                settles as {r.via}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    );

  return (
    <Screen gutter="none">
      <View style={{ paddingHorizontal: space.gutter }}>
        <HeaderBar onBack={goBack} title={<Text variant="screenTitle">Coverage</Text>} />
      </View>

      <Fill style={{ marginTop: space.s6, paddingHorizontal: space.gutter }}>
        {error ? (
          <ErrorState error={error} onRetry={symbols.reload} />
        ) : loading ? (
          <LoadingRows count={8} height={size.row} />
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: space.s30 }}
          >
            {section(
              'Priced and settleable',
              'A chart you can read and an order that can fill.',
              groups.both,
            )}
            {section(
              'Priced only',
              'A real market with a real price, which this chain cannot settle. Chart, not order.',
              groups.pricedOnly.map((symbol) => ({ symbol })),
            )}
            {section(
              'Settleable only',
              'The executor can route these, and no feed on this build prices them.',
              groups.settlesOnly.map((symbol) => ({ symbol })),
            )}
          </ScrollView>
        )}
      </Fill>
    </Screen>
  );
}
