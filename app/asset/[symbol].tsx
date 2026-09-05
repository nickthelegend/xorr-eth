/**
 * Screen 13 — Asset detail. screens.md Group B.
 *
 * Back / mark + name / star. Price 42/700 + "up 2.4% today". 170px area chart with gradient fill.
 * Range pills 1D/1W/1M/1Y/All. Three rows: Your position / Avg cost / Unrealised.
 * Agent note. Sell (control) / Buy (white).
 */
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AreaChart, pointsFromPrices } from '@/charts';
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
import { areaSeries } from '@/data/fixtures/series';

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
  const points =
    closes.length > 1 ? pointsFromPrices(closes) : (areaSeries[symbol ?? ''] ?? areaSeries.SOL!);
  const changePct = closes.length > 1 ? ((closes.at(-1)! - closes[0]!) / closes[0]!) * 100 : 0;
  const up = changePct >= 0;

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
            {closes.length ? fmtPrice(closes.at(-1)!) : (i?.px ?? '—')}
          </Text>
          {candles.data?.feed === 'simulated' ? <SimulatedTag /> : null}
        </View>
        <Text style={[type.body, { color: up ? pnl.up : pnl.down }]}>
          {up ? 'up' : 'down'} {percent(Math.abs(changePct)).replace('+', '')} today
        </Text>
      </View>

      <AreaChart
        points={points}
        height={170}
        stroke={ink.full}
        style={{ marginTop: 18 }}
        accessibilityLabel={`${i?.name ?? symbol} price chart, ${RANGES[range]}`}
      />

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

      <ButtonRow
        style={{ marginTop: 14 }}
        affirmativeFlex={1}
        secondary={
          <Button
            label="Sell"
            variant="secondary"
            onPress={() => router.push(`/order/${symbol}?side=sell`)}
          />
        }
        affirmative={
          <Button label="Buy" onPress={() => router.push(`/order/${symbol}?side=buy`)} />
        }
      />
    </Screen>
  );
}
