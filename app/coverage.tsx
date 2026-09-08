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

export default function Coverage() {
  const goBack = useGoBack();
  const symbols = useAsync(() => system.symbols(), []);
  const tradable = useAsync(() => system.tradable(), []);

  const groups = useMemo(() => {
    const priced = new Set(symbols.data ?? []);
    const settles = new Set((tradable.data ?? []).map((t) => t.symbol.toUpperCase()));
    const both: string[] = [];
    const pricedOnly: string[] = [];
    for (const s of priced) (settles.has(s.toUpperCase()) ? both : pricedOnly).push(s);
    const settlesOnly = (tradable.data ?? [])
      .map((t) => t.symbol)
      .filter((s) => !priced.has(s) && ![...priced].some((p) => p.toUpperCase() === s.toUpperCase()));
    return { both: both.sort(), pricedOnly: pricedOnly.sort(), settlesOnly: settlesOnly.sort() };
  }, [symbols.data, tradable.data]);

  const error = symbols.error ?? tradable.error;
  const loading = (symbols.loading && !symbols.data) || (tradable.loading && !tradable.data);

  const section = (title: string, blurb: string, rows: string[]) =>
    rows.length === 0 ? null : (
      <View style={{ marginTop: space.s20 }}>
        <Eyebrow>{title}</Eyebrow>
        <Text variant="footnote" color={colors.ink28} style={{ marginTop: space.s4 }}>
          {blurb}
        </Text>
        {rows.map((s) => (
          <View key={s} style={[{ paddingVertical: space.s12 }, divider]}>
            <Text variant="rowPrimary">{s}</Text>
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
              groups.pricedOnly,
            )}
            {section(
              'Settleable only',
              'The executor can route these, and no feed on this build prices them.',
              groups.settlesOnly,
            )}
          </ScrollView>
        )}
      </Fill>
    </Screen>
  );
}
