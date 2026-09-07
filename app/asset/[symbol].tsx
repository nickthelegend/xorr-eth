/**
 * Screen 13 — Asset detail. screens.md Group B.
 *
 * Back / mark + name / star. Price at `priceLg` with a live delta chip. A chart — candles by
 * default, tapping switches to the line — over the real series for the selected range. Range
 * pills. The position rows, from the real book. Sell / Buy.
 *
 * Rebuilt on `src/ui`. Everything that used to be invented is gone: the position rows were
 * hardcoded (1,750.30 SOL, avg cost $81.14, +$12,566), and the chart fell back to
 * `areaSeries.SOL`, drawing Solana's shape under whatever symbol you had opened.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useGoBack } from '@/nav/useGoBack';
import {
  AreaChart,
  AssetMark,
  Button,
  ButtonPair,
  Candlestick,
  DeltaChip,
  ErrorState,
  Fill,
  IconButton,
  NoteStrip,
  Pill,
  PillRow,
  Press,
  Price,
  Row,
  Screen,
  Tag,
  Text,
  colors,
  money,
  percent,
  pnlTone,
  price as fmtPrice,
  quantity,
  space,
  tightProjection,
  toCandles,
} from '@/ui';
import { signedMoney } from '@/format';
import { repos } from '@/data';
import { api } from '@/data/api';
import { useAsync } from '@/data/useAsync';
import { usePrice } from '@/data/usePrices';
import { rangeChange } from '@/state/derived';
import { isTradable, settlementSymbol } from '@/data/tradable';

const RANGES = ['1D', '1W', '1M', '1Y', 'All'] as const;
/** The timeframe each range pill maps to when asking for real candles. */
const RANGE_TF = { '1D': '1H', '1W': '4H', '1M': '1D', '1Y': '1W', All: '1W' } as const;

const CHART_H = 170;
const ROW_H = 52;

export default function AssetDetail() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const router = useRouter();
  const goBack = useGoBack();
  const [range, setRange] = useState(0);
  const [starred, setStarred] = useState(false);
  // design.md calls the candlestick the centrepiece, and the bars are already fetched — the
  // area chart was only ever a summary of the same data. Both are offered; candles are the
  // default wherever there are real ones to draw.
  const [candleView, setCandleView] = useState(true);

  const inst = useAsync(() => repos.markets.getInstrument(symbol!), [symbol]);
  const positions = useAsync(() => repos.portfolio.positions(), []);
  const held = (positions.data ?? []).find((p) => p.symbol === symbol);
  const candles = useAsync(
    () => repos.markets.candles(symbol!, RANGE_TF[RANGES[range]!]),
    [symbol, range],
  );

  const i = inst.data;
  const bars = candles.data?.bars;
  const series = useMemo(() => toCandles(bars ?? []), [bars]);
  const closes = series.map((c) => c.close);
  const hasSeries = closes.length > 1;
  // "Not yet" and "not ever" get different words, and the first one retries.
  const warming = candles.data?.feed === 'warming';

  const seriesPct = hasSeries ? ((closes.at(-1)! - closes[0]!) / closes[0]!) * 100 : 0;

  // Tokenized equities have a real spot price and no history: they are priced off the 1inch
  // route that would fill them, not a candle feed. A real price with no chart is a true
  // state to show.
  const { quote, loading: priceLoading, reload: reloadQuote } = usePrice(symbol);

  /*
   * The percentage names the window it measured.
   *
   * It said "today" whatever the pills were set to, so 1M read "up 38.4% today" — false about a
   * real asset, on the screen someone opens to decide whether to buy. The day itself now comes
   * from the quote's 24h change, the same field the market list and the search rows read, because
   * deriving it a second way from the candles is what made one asset show 2.1% here and 2.55%
   * there at the same moment.
   */
  const { pct: changePct, label: changeLabel } = rangeChange(
    RANGES[range] ?? '1D',
    seriesPct,
    quote?.change24h,
  );
  const up = changePct >= 0;

  /*
   * The same asset, priced a second way.
   *
   * Every number in this app came from one feed, and one feed is one point of being wrong.
   * 1inch's spot price is derived from the on-chain liquidity a fill would actually go
   * through, which makes it the right second opinion rather than just another API: when the
   * two disagree, the one that decides what a trade costs is the on-chain one.
   */
  const cross = useAsync(
    () =>
      api.get<{ agree: boolean; note: string }>(
        `/market/crosscheck?symbol=${encodeURIComponent(symbol ?? '')}`,
      ),
    [symbol],
  );

  // The hero reads live SPOT, not the last candle close — a candle series is a history and
  // the number at the top of this screen is a price.
  const spot = quote?.price && quote.price > 0 ? quote.price : hasSeries ? closes.at(-1)! : undefined;

  /*
   * Still arriving, in any of the three ways it can be.
   *
   * The screen only knew "have data" and "have none", so during the very first fetch it said
   * "No live price for this market" and "No chart for this market yet" — a confident claim
   * about a market it had not finished asking about. Loading, warming and empty are three
   * different states and only the last one is news.
   */
  const warmingAny =
    warming || quote?.warming === true || priceLoading || (candles.loading && !candles.data);

  // The executor answered "come back", so come back. Without this the screen sits on its
  // warming message until the user navigates, which looks identical to being stuck.
  useEffect(() => {
    if (!warmingAny) return;
    const t = setTimeout(() => {
      candles.reload();
      reloadQuote();
    }, 4_000);
    return () => clearTimeout(t);
  }, [warmingAny, candles, reloadQuote]);

  if (inst.error) {
    return (
      <Screen>
        <ErrorState error={inst.error} onRetry={inst.reload} />
      </Screen>
    );
  }

  const tradable = isTradable(symbol ?? '');

  return (
    <Screen gutter="none">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: space.gutter,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s10, flex: 1 }}>
          <IconButton
            name="back"
            accessibilityLabel="Back"
            background="none"
            onPress={() => goBack()}
          />
          {i ? <AssetMark gradient={{ c1: i.c1, c2: i.c2 }} size={26} /> : null}
          <Text variant="cardTitleLg" numberOfLines={1}>
            {i?.name ?? symbol}
          </Text>
        </View>
        <IconButton
          name={starred ? 'starFilled' : 'star'}
          accessibilityLabel={starred ? 'Remove from watchlist' : 'Add to watchlist'}
          background="none"
          color={starred ? colors.ink : colors.ink55}
          onPress={() => setStarred((s) => !s)}
        />
      </View>

      <View style={{ alignItems: 'center', marginTop: space.s22, gap: space.s6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s10 }}>
          <Price variant="priceLg">{spot !== undefined ? fmtPrice(spot) : '—'}</Price>
          {spot === undefined && !warmingAny ? <Tag label="Simulated" small tone="warn" /> : null}
        </View>
        {hasSeries ? (
          <DeltaChip
            label={`${up ? 'up' : 'down'} ${percent(Math.abs(changePct)).replace('+', '')} ${changeLabel}`}
            tone={pnlTone(changePct)}
            style={{ alignSelf: 'center' }}
          />
        ) : (
          <Text variant="body" color={colors.ink40}>
            {warmingAny
              ? 'Fetching the latest price…'
              : spot === undefined
                ? 'No live price for this market.'
                : 'Spot price. No price history for this market.'}
          </Text>
        )}

        {/*
          A second opinion, from the pools a fill would actually touch.

          Shown only when it DISAGREES. A line saying "two sources agree" on every asset every
          day is noise that trains people to stop reading — the whole value is that it appears
          when something is wrong, and the number the executor would trade at is the one that
          matters when they diverge.
        */}
        {cross.data && !cross.data.agree ? (
          <Text
            variant="secondarySm"
            color={colors.warn}
            align="center"
            style={{ marginTop: space.s6, paddingHorizontal: space.gutter }}
          >
            {cross.data.note}
          </Text>
        ) : null}
      </View>

      {hasSeries ? (
        <Press
          onPress={() => setCandleView((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={`${i?.name ?? symbol} ${candleView ? 'candlestick' : 'price'} chart, ${RANGES[range]}. Switch to the ${candleView ? 'line' : 'candle'} view.`}
          style={{ marginTop: space.s18, paddingHorizontal: space.gutter }}
        >
          {candleView ? (
            <Candlestick
              series={series}
              projection={tightProjection(series)}
              height={CHART_H}
              lastPrice={{ value: closes.at(-1)!, label: fmtPrice(closes.at(-1)!) }}
            />
          ) : (
            <AreaChart
              data={closes}
              height={CHART_H}
              color={up ? colors.up : colors.down}
              endDot
            />
          )}
        </Press>
      ) : (
        <View
          style={{
            height: CHART_H,
            marginTop: space.s18,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text variant="body" color={colors.ink40}>
            {warmingAny ? 'Fetching price history…' : 'No chart for this market yet.'}
          </Text>
        </View>
      )}

      <PillRow style={{ marginTop: space.s16, flexGrow: 0 }} contentPadding={space.gutter}>
        {RANGES.map((r, idx) => (
          <Pill key={r} label={r} selected={idx === range} onPress={() => setRange(idx)} />
        ))}
      </PillRow>

      <Fill style={{ marginTop: space.s14, paddingHorizontal: space.gutter }}>
        {held ? (
          <>
            <Row
              title="Your position"
              value={<Price>{`${quantity(held.units)} ${symbol}`}</Price>}
              secondary={money(held.notional)}
              height={ROW_H}
            />
            <Row title="Avg cost" value={<Price>{fmtPrice(held.entry)}</Price>} height={ROW_H} />
            <Row
              title="Unrealised"
              value={<Price tone={pnlTone(held.unrealised)}>{signedMoney(held.unrealised)}</Price>}
              delta={percent(held.unrealisedPct)}
              deltaTone={pnlTone(held.unrealised)}
              height={ROW_H}
              divider={false}
            />
          </>
        ) : (
          <Row
            title="Your position"
            value={<Text variant="rowPrimary" color={colors.ink55}>None</Text>}
            height={ROW_H}
            divider={false}
          />
        )}
        <NoteStrip kind={held ? 'acted' : 'risk'} style={{ marginTop: space.s16 }}>
          {held
            ? 'Momentum Scout holds this from your recurring buys. It will not add without asking.'
            : 'No agent holds this yet. Set up a recurring buy and it will start.'}
        </NoteStrip>
      </Fill>

      {/*
        A Buy button on a market this chain cannot settle is a promise the app cannot keep.
        These instruments are real markets and their prices are labelled SIMULATED; what does
        not exist is a token on Base to route into. Saying so is better than a button that
        leads to an order ticket which can never be filled.
      */}
      <View style={{ paddingHorizontal: space.gutter }}>
        {tradable ? (
          <ButtonPair
            style={{ marginTop: space.s14 }}
            left={
              <Button
                label="Sell"
                variant="secondary"
                onPress={() => router.push(`/order/${settlementSymbol(symbol ?? '')}?side=sell`)}
              />
            }
            right={
              <Button
                label="Buy"
                onPress={() => router.push(`/order/${settlementSymbol(symbol ?? '')}?side=buy`)}
              />
            }
          />
        ) : (
          <View style={{ marginTop: space.s14, paddingVertical: space.s14, alignItems: 'center' }}>
            <Text variant="secondary" align="center">
              Not tradable on Base. There is no token for this market to settle into.
            </Text>
          </View>
        )}
      </View>
    </Screen>
  );
}
