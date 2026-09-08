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
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useGoBack } from '@/nav/useGoBack';
import { chainLabel } from '@/chain';
import { assetGradient } from '@/design/gradients';
import {
  AreaChart,
  AssetMark,
  Button,
  ButtonPair,
  Candlestick,
  DeltaChip,
  ErrorState,
  IconButton,
  NoteStrip,
  Pill,
  PillRow,
  Segmented,
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
  size,
  space,
  tightProjection,
  toCandles,
} from '@/ui';
import { signedMoney } from '@/format';
import { repos } from '@/data';
import { api } from '@/data/api';
import { useAsync } from '@/data/useAsync';
import { useLogo } from '@/data/useLogos';
import { usePrice } from '@/data/usePrices';
import { rangeChange } from '@/state/derived';
import { settlementSymbol } from '@/data/tradable';
import { useSettleable } from '@/data/useSettleable';

const RANGES = ['1D', '1W', '1M', '1Y', 'All'] as const;
/**
 * Candles or line, as a visible control.
 *
 * Words, not glyphs. This shipped as `▮` and `∿` on the theory that two shapes read faster than
 * two words and cost less width — but at the 13px the control type is set in, `▮` is a two-pixel
 * mark and `∿` is barely a dot, and neither says anything to a screen reader, which gets the raw
 * character. A control nobody can read is not a compact control.
 */
const CHART_VIEWS: { value: number; label: string }[] = [
  { value: 0, label: 'Candles' },
  { value: 1, label: 'Line' },
];

/** Wide enough for "Candles" at 13/600, and comfortably past the 44pt minimum target. */
const CHART_VIEW_SEGMENT = 58;
const CHART_VIEW_W = CHART_VIEW_SEGMENT * 2 + space.s4 + size.segPad * 2;

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

  const logo = useLogo(symbol);
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

  /*
   * Asked of the executor, like the order ticket. A Buy button that leads to a ticket the chain
   * cannot settle is the same lie one screen earlier.
   */
  // 'checking' is rendered, not guessed through — see useSettleable.
  const settleable = useSettleable(symbol ?? '');
  const tradable = settleable !== 'no';

  if (inst.error) {
    return (
      <Screen>
        <ErrorState error={inst.error} onRetry={inst.reload} />
      </Screen>
    );
  }

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
          {/*
            The mark does not depend on the instrument being in a market class.

            It used to: `i ? <AssetMark …>` meant the header was bare for anything the market list
            does not carry — including WETH, which is the app's own default buy, sits on Home and in
            Holdings wearing its real logo, and lost it on the one screen dedicated to it. The
            instrument only ever supplied two gradient colours, and `assetGradient` derives those
            from the symbol, so there is nothing to wait for.
          */}
          <AssetMark
            gradient={i ? { c1: i.c1, c2: i.c2 } : assetGradient(symbol ?? '')}
            {...logo}
            size={26}
          />
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

      {/*
        Everything between the header and the footer scrolls.
        The design canvas is 874 tall and an iPhone SE is 667. Price, chart, range pills, the
        chart-type control, the position rows and the note come to more than that, so on a short
        device the bottom of it was simply unreachable — `Fill` anchors height, it does not give
        you a way to reach what overflows. The Sell/Buy pair stays pinned outside, because the
        action must not scroll away.
      */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: space.s14 }}
        showsVerticalScrollIndicator={false}
      >
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

      {/*
        The chart type, visibly.

        Both charts have been here since the beginning and the only way to swap them was to tap the
        chart itself — an affordance with nothing on screen to suggest it existed, so the line view
        may as well not have shipped. The tap still works; this is what says so.

        Above the chart rather than beside the range pills, which is where it went first: five range
        pills and a two-word control do not fit one 402pt row, and what that shipped was "All"
        sliced in half by the control's left edge. They also answer different questions — the pills
        pick a period, this picks a rendering — and the one that belongs to the chart sits with it.
      */}
      {hasSeries ? (
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'flex-end',
            marginTop: space.s12,
            paddingHorizontal: space.gutter,
          }}
        >
          <Segmented
            options={CHART_VIEWS}
            value={candleView ? 0 : 1}
            onChange={(v) => setCandleView(v === 0)}
            height={size.segThumbSm}
            /*
             * An explicit width, because `Segmented` has no intrinsic one: design.md §5 gives the
             * thumb `flex: 1`, which is right for the full-width control it usually is and means
             * that anywhere else it collapses to its own 4pt padding — which is exactly what
             * shipped first, a two-pixel white sliver against the bezel.
             */
            style={{ width: CHART_VIEW_W }}
          />
        </View>
      ) : null}

      {hasSeries ? (
        <Press
          onPress={() => setCandleView((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={`${i?.name ?? symbol} ${candleView ? 'candlestick' : 'price'} chart, ${RANGES[range]}. Switch to the ${candleView ? 'line' : 'candle'} view.`}
          style={{ marginTop: space.s10, paddingHorizontal: space.gutter }}
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

      <PillRow style={{ marginTop: space.s16 }} contentPadding={space.gutter}>
        {RANGES.map((r, idx) => (
          <Pill key={r} label={r} selected={idx === range} onPress={() => setRange(idx)} />
        ))}
      </PillRow>

      <View style={{ marginTop: space.s14, paddingHorizontal: space.gutter }}>
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
      </View>
      </ScrollView>

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
                disabled={settleable === 'checking'}
                onPress={() => router.push(`/order/${settlementSymbol(symbol ?? '')}?side=sell`)}
              />
            }
            right={
              <Button
                label="Buy"
                disabled={settleable === 'checking'}
                onPress={() => router.push(`/order/${settlementSymbol(symbol ?? '')}?side=buy`)}
              />
            }
          />
        ) : (
          <View style={{ marginTop: space.s14, paddingVertical: space.s14, alignItems: 'center' }}>
            <Text variant="secondary" align="center">
              {/*
                This said "Not tradable on Base. There is no token for this market to settle into."
                The order ticket had already been corrected away from that sentence and this screen
                was missed — so the Stocks tab listed NVDAc at a live 1inch price ON BASE, and
                tapping it said there is no token for it on Base. Both halves were wrong for an
                equity: the token exists and is busy on Base mainnet; what it does not do is
                function on a fork of it. `chainLabel` names the chain this build actually settles
                on, which makes the sentence true for an index that has no instrument anywhere and
                for an equity that has one everywhere but here.
              */}
              {`${symbol} cannot be settled on ${chainLabel}, so there is no order to place.`}
            </Text>
          </View>
        )}
      </View>
    </Screen>
  );
}
