/**
 * Two instruments over the same window.
 *
 * Every chart in the app is one asset alone, which answers "did this go up" and never "did this go
 * up more than that". Relative performance is the question people actually have when they hold two
 * things, and it needs both series normalised to the same start — an absolute overlay of a
 * seventy-thousand-dollar asset and a one-dollar one is a flat line and a spike.
 *
 * Normalised to percent from the first bar, which is why the axis is a percentage and not a price.
 * The two series may have different bar counts if one market has less history; both are drawn over
 * however many bars they have, and the shorter one simply stops.
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useGoBack } from '@/nav/useGoBack';
import {
  AreaChart,
  ErrorState,
  Fill,
  HeaderBar,
  Pill,
  PillRow,
  Placeholder,
  Screen,
  SheetCard,
  Text,
  colors,
  radius,
  space,
  toCandles,
} from '@/ui';
import { percent } from '@/format';
import { useAsync } from '@/data/useAsync';
import { repos } from '@/data';
import { TRADABLE } from '@/data/tradable';

const CHART_H = 130;
/** Enough history to be a comparison, short enough that both markets have it. */
const TIMEFRAME = '1D' as const;

/**
 * The gap between two percentage changes.
 *
 * `percent()` would render this with a `%` sign, and it is not a percentage — the difference
 * between a rise of four percent and a rise of one percent is three percentage POINTS, not three
 * percent. Conflating the two is the most common way a comparison like this misleads, so it gets
 * its own formatter rather than borrowing one that would label it wrongly.
 */
function points(n: number): string {
  return `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} points`;
}

/** Percent change from the first bar, so two very different prices can share an axis. */
function normalise(closes: number[]): number[] {
  const first = closes[0];
  if (!first) return [];
  return closes.map((c) => ((c - first) / first) * 100);
}

export default function Compare() {
  const goBack = useGoBack();
  const [left, setLeft] = useState<string>('WETH');
  const [right, setRight] = useState<string>('CBBTC');

  const a = useAsync(() => repos.markets.candles(left, TIMEFRAME), [left]);
  const b = useAsync(() => repos.markets.candles(right, TIMEFRAME), [right]);

  /*
   * Through `toCandles`, not by indexing the tuple. A `Bar` is `[o, h, l, c]` and reaching for
   * element three by hand is how a chart silently plots opens: the named accessor is the reason
   * that helper exists.
   */
  const seriesA = useMemo(
    () => normalise(toCandles(a.data?.bars ?? []).map((c) => c.close)),
    [a.data],
  );
  const seriesB = useMemo(
    () => normalise(toCandles(b.data?.bars ?? []).map((c) => c.close)),
    [b.data],
  );

  const changeA = seriesA.at(-1);
  const changeB = seriesB.at(-1);

  const error = a.error ?? b.error;
  const loading = (a.loading && !a.data) || (b.loading && !b.data);

  return (
    <Screen gutter="none">
      <View style={{ paddingHorizontal: space.gutter }}>
        <HeaderBar onBack={goBack} title={<Text variant="screenTitle">Compare</Text>} />
        <Text variant="secondary" color={colors.ink40} style={{ marginTop: space.s8 }}>
          Both normalised to where they started, so the shapes are comparable.
        </Text>
      </View>

      <Fill style={{ marginTop: space.s12 }}>
        {error ? (
          <View style={{ paddingHorizontal: space.gutter }}>
            <ErrorState error={error} onRetry={a.reload} />
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.s30 }}>
            <Side
              label="First"
              symbol={left}
              onPick={setLeft}
              series={seriesA}
              change={changeA}
              loading={loading}
              tone={colors.up}
            />
            <Side
              label="Second"
              symbol={right}
              onPick={setRight}
              series={seriesB}
              change={changeB}
              loading={loading}
              tone={colors.ink65}
            />

            {changeA !== undefined && changeB !== undefined ? (
              <View style={{ paddingHorizontal: space.gutter, marginTop: space.s16 }}>
                <SheetCard bordered borderRadius={radius.panel} padding={space.s14}>
                  <Text variant="footnote" color={colors.ink40}>
                    GAP
                  </Text>
                  {/*
                    Percentage POINTS, not percent. The difference between two percentage changes is
                    not itself a percentage change, and calling it one is the most common way this
                    kind of comparison misleads.
                  */}
                  <Text variant="rowPrimary" style={{ marginTop: space.s4 }}>
                    {points(Math.abs(changeA - changeB))}
                  </Text>
                  <Text variant="secondarySm" color={colors.ink40} style={{ marginTop: space.s8 }}>
                    {changeA > changeB ? left : right} is ahead over this window.
                  </Text>
                </SheetCard>
              </View>
            ) : null}
          </ScrollView>
        )}
      </Fill>
    </Screen>
  );
}

function Side({
  label,
  symbol,
  onPick,
  series,
  change,
  loading,
  tone,
}: {
  label: string;
  symbol: string;
  onPick: (s: string) => void;
  series: number[];
  change: number | undefined;
  loading: boolean;
  tone: string;
}) {
  return (
    <View style={{ marginTop: space.s16 }}>
      <View style={{ paddingHorizontal: space.gutter }}>
        <Text variant="footnote" color={colors.ink40}>
          {label.toUpperCase()}
        </Text>
      </View>

      <PillRow style={{ marginTop: space.s8 }} contentPadding={space.gutter}>
        {TRADABLE.map((t) => (
          <Pill key={t} label={t} selected={t === symbol} onPress={() => onPick(t)} />
        ))}
      </PillRow>

      <View style={{ paddingHorizontal: space.gutter, marginTop: space.s12 }}>
        {loading ? (
          <Placeholder height={CHART_H} />
        ) : series.length < 2 ? (
          <Text variant="secondarySm" color={colors.ink40}>
            No history for {symbol} over this window.
          </Text>
        ) : (
          <>
            <AreaChart data={series} height={CHART_H} color={tone} endDot />
            <Text variant="rowPrimary" color={tone} style={{ marginTop: space.s8 }}>
              {symbol} {change === undefined ? '—' : percent(change, { explicitSign: true })}
            </Text>
          </>
        )}
      </View>
    </View>
  );
}
