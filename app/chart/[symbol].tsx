/**
 * Screen 21 — Pro chart. screens.md Group B.
 *
 * Price 38/700, change chip, "{signed} today". A 230pt candlestick on the TIGHT projection:
 * grid, candles, a 56pt right price axis derived from the projection, and the dashed mark
 * line with its chip — all of which `Candlestick` now draws itself. A 42pt volume row
 * beneath. Timeframe pills 15m/1H/4H/1D/1W. Agent note. Short / Long.
 *
 * Short and Long had no `onPress`. On the screen a user reaches to act from, the two
 * buttons that act did nothing; they open the order ticket on the right side now.
 */
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Button,
  ButtonPair,
  Candlestick,
  DeltaChip,
  EmptyState,
  Fill,
  IconButton,
  LoadingRows,
  NoteStrip,
  Pill,
  PillRow,
  Price,
  Screen,
  Tag,
  Text,
  VolumeBars,
  chart,
  colors,
  percent,
  price as fmtPrice,
  space,
  tightProjection,
  toCandles,
} from '@/ui';
import { axisLabel, signedMoney } from '@/format';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import type { Timeframe } from '@/data/types';

const TIMEFRAMES: Timeframe[] = ['15m', '1H', '4H', '1D', '1W'];
const CHART_H = 230;

export default function ProChart() {
  const { symbol = 'BTC' } = useLocalSearchParams<{ symbol: string }>();
  const router = useRouter();
  // screens.md: 1H is the default (bolded in the pill row).
  const [tf, setTfRaw] = useState(1);
  /*
   * Which candle the user is reading, if any.
   *
   * A selection is an index into ONE specific series. Carrying it across a timeframe change
   * would leave it pointing at a different bar, of a different length, while looking like the
   * same choice — and the readout would confidently show the wrong candle's numbers.
   */
  const [sel, setSel] = useState<number | null>(null);
  const setTf = (next: number) => {
    setSel(null);
    setTfRaw(next);
  };

  const { data, loading, error } = useAsync(
    () => repos.markets.candles(symbol, TIMEFRAMES[tf]!),
    [symbol, tf],
  );

  const bars = data?.bars;
  const series = useMemo(() => toCandles(bars ?? []), [bars]);
  const proj = series.length ? tightProjection(series) : null;

  const last = series.length ? series[series.length - 1]!.close : 0;
  const first = series.length ? series[0]!.open : 0;
  const changeAbs = last - first;
  const changePct = first ? (changeAbs / first) * 100 : 0;
  const up = changeAbs >= 0;
  const greenCloses = series.filter((c) => c.close >= c.open).length;
  /** The OHLC of the chosen bar. Guarded, because a stale index must not read past the end. */
  const picked = sel !== null && sel >= 0 && sel < series.length ? series[sel]! : null;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s8 }}>
        <IconButton
          name="back"
          accessibilityLabel="Back"
          background="none"
          onPress={() => router.back()}
        />
        <Text variant="cardTitle">{symbol}/USD</Text>
        {data?.feed === 'simulated' ? <Tag label="Simulated" small tone="warn" /> : null}
      </View>

      {/* PLAN.md §1.4.5 — nothing lies. With no series there is no last price, and
          rendering the `0` fallback put "$0.0000" and a green "+0.00%" on screen as if
          they were a quote. No bars means no number: say so instead. */}
      <View style={{ marginTop: space.s18, gap: space.s8 }}>
        {series.length ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s10 }}>
              <Price variant="priceMd">{fmtPrice(last)}</Price>
              <DeltaChip label={percent(changePct, 2)} tone={up ? 'up' : 'down'} />
            </View>
            {/*
              The numbers behind one bar, when a bar is chosen.
              The chart was the centrepiece and read-only: a user could see the shape and
              never the open, high, low or close of any single candle. The data is already
              loaded, so this costs a tap and nothing else, and the line reverts the moment
              the selection clears.
            */}
            {picked ? (
              <Text variant="secondary" color={colors.ink55}>
                {`O ${fmtPrice(picked.open)}  H ${fmtPrice(picked.high)}  L ${fmtPrice(picked.low)}  C ${fmtPrice(picked.close)}`}
              </Text>
            ) : (
              <Text variant="secondary">{signedMoney(changeAbs)} today</Text>
            )}
          </>
        ) : loading ? (
          <Price variant="priceMd" color={colors.ink30}>
            —
          </Price>
        ) : (
          <>
            <Price variant="priceMd" color={colors.ink30}>
              —
            </Price>
            <Text variant="secondary">No price feed for {symbol}.</Text>
          </>
        )}
      </View>

      <Fill style={{ marginTop: space.s18 }}>
        {loading && !data ? (
          <LoadingRows count={3} height={70} />
        ) : !proj ? (
          <EmptyState
            text={
              error
                ? 'The price feed did not answer, so there is no chart to draw.'
                : `No candles for ${symbol} on this range.`
            }
          />
        ) : (
          <>
            <Candlestick
              series={series}
              projection={proj}
              height={CHART_H}
              grid
              showAxis
              formatAxis={axisLabel}
              lastPrice={{ value: last, label: fmtPrice(last) }}
              selected={sel}
              onSelect={setSel}
            />
            {/* The axis gutter is reserved so the bars line up under their candles. */}
            <VolumeBars
              series={series}
              axisWidth={chart.axisWidth}
              style={{ marginTop: space.s10 }}
            />
          </>
        )}
      </Fill>

      <PillRow style={{ marginTop: space.s14, flexGrow: 0 }}>
        {TIMEFRAMES.map((t, i) => (
          <Pill key={t} label={t} selected={i === tf} onPress={() => setTf(i)} />
        ))}
      </PillRow>

      {/* Derived from the series on screen. The handoff's note quoted a fixed "$65.2K
          shelf", which read as nonsense once the live price moved anywhere near it.

          Three states, not two. While the request is in flight there is no series AND no
          answer — asserting "no live series" then put a conclusion on screen underneath a
          loading placeholder, which is the screen contradicting itself. */}
      {loading && !data ? null : (
        <NoteStrip kind={series.length === 0 ? 'risk' : up ? 'acted' : 'risk'} style={{ marginTop: space.s16 }}>
          {series.length === 0
            ? error
              ? `I could not reach the price feed: ${error.message}`
              : 'No live series for this market, so there is nothing for me to read.'
            : `${greenCloses} of the last ${series.length} closes were up. Momentum Scout is watching the range high before it adds.`}
        </NoteStrip>
      )}

      <ButtonPair
        style={{ marginTop: space.s14 }}
        left={
          <Button
            label="Short"
            variant="secondary"
            onPress={() => router.push(`/order/${symbol}?side=sell`)}
          />
        }
        right={
          <Button
            label="Long"
            backgroundColor={colors.candleUp}
            color={colors.ink}
            onPress={() => router.push(`/order/${symbol}?side=buy`)}
          />
        }
      />
    </Screen>
  );
}
