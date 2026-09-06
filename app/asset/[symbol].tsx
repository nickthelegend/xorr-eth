/**
 * Screen 13 — Asset detail. screens.md Group B.
 *
 * Back / mark + name / star. Price 42/700 + "up 2.4% today". 170px area chart with gradient fill.
 * Range pills 1D/1W/1M/1Y/All. Three rows: Your position / Avg cost / Unrealised.
 * Agent note. Sell (control) / Buy (white).
 */
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AreaChart, Candlestick, pointsFromPrices, projectCandles, tight } from '@/charts';
import {
  AssetMark,
  Button,
  ButtonRow,
  ErrorState,
  IconButton,
  NoteStrip,
  Pill,
  PillRow,
  Row,
  Screen,
  ScreenHeader,
  SimulatedTag,
} from '@/design/components';
import { ink, pnl } from '@/design/colors';
import { type } from '@/design/type';
import { money, percent, price as fmtPrice, quantity, signedMoney } from '@/format';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import { usePrice } from '@/data/usePrices';
import { isTradable, settlementSymbol } from '@/data/tradable';

const RANGES = ['1D', '1W', '1M', '1Y', 'All'] as const;
/** The timeframe each range pill maps to when asking for real candles. */
const RANGE_TF = { '1D': '1H', '1W': '4H', '1M': '1D', '1Y': '1W', All: '1W' } as const;

export default function AssetDetail() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const router = useRouter();
  const [range, setRange] = useState(0);
  const [starred, setStarred] = useState(false);

  const inst = useAsync(() => repos.markets.getInstrument(symbol!), [symbol]);
  // The position rows were hardcoded (1,750.30 SOL, avg cost $81.14, +$12,566). They now come
  // from the real position book, and say plainly when there is no holding.
  const positions = useAsync(() => repos.portfolio.positions(), []);
  const held = (positions.data ?? []).find((p) => p.symbol === symbol);
  const candles = useAsync(
    () => repos.markets.candles(symbol!, RANGE_TF[RANGES[range]!]),
    [symbol, range],
  );


  const i = inst.data;
  const bars = candles.data?.bars ?? [];
  const closes = bars.map((b) => b[3]);
  // No real series means NO CHART. The fallback here used to be `areaSeries.SOL`, which drew
  // Solana's shape under whatever symbol the user had opened — the repository refuses to invent
  // bars and the screen was quietly undoing that.
  // "Not yet" and "not ever" get different words, and the first one retries.
  const warming = candles.data?.feed === 'warming';

  const hasSeries = closes.length > 1;
  const points = hasSeries ? pointsFromPrices(closes) : null;
  // design.md calls the candlestick the centrepiece, and the bars are already fetched — the area
  // chart was only ever a summary of the same data. Both are offered; candles are the default
  // wherever there are real ones to draw.
  const [candleView, setCandleView] = useState(true);
  const changePct = hasSeries ? ((closes.at(-1)! - closes[0]!) / closes[0]!) * 100 : 0;
  const up = changePct >= 0;

  // Tokenized equities have a real spot price and no history: they are priced off the 1inch route
  // that would fill them, not a candle feed. A real price with no chart is a true state to show.
  const { quote, loading: priceLoading, reload: reloadQuote } = usePrice(symbol);
  const spot = hasSeries ? closes.at(-1)! : quote?.price && quote.price > 0 ? quote.price : undefined;
  // Either half can still be arriving; both say "fetching" rather than "nothing here".
  /*
   * Still arriving, in any of the three ways it can be.
   *
   * The screen only knew "have data" and "have none", so during the very first fetch it said "No
   * live price for this market" and "No chart for this market yet" — a confident claim about a
   * market it had not finished asking about. Loading, warming and empty are three different
   * states and only the last one is news.
   */
  const warmingAny =
    warming || quote?.warming === true || priceLoading || (candles.loading && !candles.data);

  // The executor answered "come back", so come back. Without this the screen sits on its warming
  // message until the user navigates, which looks identical to being stuck.
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

  return (
    <Screen>
      <ScreenHeader
        left={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <IconButton
              name="back"
              accessibilityLabel="Back"
              onPress={() => router.back()}
              background="transparent"
              color={ink.i55}
            />
            {i ? <AssetMark gradient={{ c1: i.c1, c2: i.c2 }} size={26} /> : null}
            <Text style={[type.cardTitle, { color: ink.full }]}>{i?.name ?? symbol}</Text>
          </View>
        }
        right={
          <IconButton
            name={starred ? 'starFilled' : 'star'}
            accessibilityLabel={starred ? 'Remove from watchlist' : 'Add to watchlist'}
            background="transparent"
            color={starred ? ink.full : ink.i55}
            onPress={() => setStarred((s) => !s)}
          />
        }
      />

      <View style={{ marginTop: 22, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={[type.priceLarge, { color: ink.full }]}>
            {spot !== undefined ? fmtPrice(spot) : '—'}
          </Text>
          {spot === undefined && !warmingAny ? <SimulatedTag /> : null}
        </View>
        {hasSeries ? (
          <Text style={[type.body, { color: up ? pnl.up : pnl.down }]}>
            {up ? 'up' : 'down'} {percent(Math.abs(changePct)).replace('+', '')} today
          </Text>
        ) : (
          <Text style={[type.body, { color: ink.i40 }]}>
            {warmingAny
              ? 'Fetching the latest price…'
              : spot === undefined
                ? 'No live price for this market.'
                : 'Spot price. No price history for this market.'}
          </Text>
        )}
      </View>

      {points && candleView ? (
        <Pressable
          onPress={() => setCandleView(false)}
          accessibilityRole="button"
          accessibilityLabel={`${i?.name ?? symbol} candlestick chart, ${RANGES[range]}. Switch to the line view.`}
        >
          <Candlestick candles={projectCandles(bars, tight(bars))} height={170} style={{ marginTop: 18 }} />
        </Pressable>
      ) : points ? (
        <Pressable
          onPress={() => setCandleView(true)}
          accessibilityRole="button"
          accessibilityLabel={`${i?.name ?? symbol} price chart, ${RANGES[range]}. Switch to candles.`}
        >
          <AreaChart
            points={points}
            height={170}
            stroke={ink.full}
            style={{ marginTop: 18 }}
          />
        </Pressable>
      ) : (
        <View
          style={{ height: 170, marginTop: 18, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={[type.body, { color: ink.i40 }]}>
            {warmingAny ? 'Fetching price history…' : 'No chart for this market yet.'}
          </Text>
        </View>
      )}

      <PillRow style={{ marginTop: 16, flexGrow: 0 }}>
        {RANGES.map((r, idx) => (
          <Pill key={r} label={r} selected={idx === range} onPress={() => setRange(idx)} />
        ))}
      </PillRow>

      <Screen.Content style={{ marginTop: 14 }}>
        {held ? (
          <>
            <Row
              primary="Your position"
              value={`${quantity(held.units)} ${symbol}`}
              secondary={money(held.notional)}
              height={52}
            />
            <Row primary="Avg cost" value={fmtPrice(held.entry)} height={52} />
            <Row
              primary="Unrealised"
              value={signedMoney(held.unrealised)}
              valueColor={held.unrealised >= 0 ? pnl.up : pnl.down}
              delta={percent(held.unrealisedPct)}
              deltaColor={held.unrealised >= 0 ? pnl.up : pnl.down}
              height={52}
              divider={false}
            />
          </>
        ) : (
          <Row
            primary="Your position"
            value="None"
            valueColor={ink.i55}
            height={52}
            divider={false}
          />
        )}
        <NoteStrip kind={held ? 'acted' : 'risk'} style={{ marginTop: 16 }}>
          {held
            ? `Momentum Scout holds this from your recurring buys. It will not add without asking.`
            : `No agent holds this yet. Set up a recurring buy and it will start.`}
        </NoteStrip>
      </Screen.Content>

      {/*
        A Buy button on a market this chain cannot settle is a promise the app cannot keep. These
        instruments are real markets and their prices are labelled SIMULATED; what does not exist
        is a token on Base to route into. Saying so is better than a button that leads to an order
        ticket which can never be filled.
      */}
      {isTradable(symbol ?? '') ? (
        <ButtonRow
          style={{ marginTop: 14 }}
          affirmativeFlex={1}
          secondary={
            <Button
              label="Sell"
              variant="secondary"
              onPress={() => router.push(`/order/${settlementSymbol(symbol ?? '')}?side=sell`)}
            />
          }
          affirmative={
            <Button
              label="Buy"
              onPress={() => router.push(`/order/${settlementSymbol(symbol ?? '')}?side=buy`)}
            />
          }
        />
      ) : (
        <View style={{ marginTop: 14, paddingVertical: 14, alignItems: 'center' }}>
          <Text style={[type.secondary, { color: ink.i40, textAlign: 'center' }]}>
            Not tradable on Base. There is no token for this market to settle into.
          </Text>
        </View>
      )}
    </Screen>
  );
}
