/**
 * Screen 21 — Pro chart. screens.md Group B.
 *
 * Price 38/700, change chip, "+$442 today". 230px candlestick on the TIGHT projection:
 * 4 grid lines, 12 candles, 56px right price axis derived from the projection, dashed mark line
 * + white chip. 42px volume row beneath. Timeframe pills 15m/1H/4H/1D/1W.
 * Agent note. Short (control) / Long (#16C060).
 */
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Candlestick,
  MarkLine,
  VolumeRow,
  axisPrices,
  projectCandles,
  projectVolume,
  tight,
  volumeFromBars,
} from '@/charts';
import {
  Button,
  ButtonRow,
  IconButton,
  LoadingRows,
  NoteStrip,
  Pill,
  PillRow,
  Screen,
  ScreenHeader,
  SimulatedTag,
} from '@/design/components';
import { borders, ink, pnl } from '@/design/colors';
import { hairlineWidth } from '@/design/space';
import { type } from '@/design/type';
import { axisLabel, percent, price as fmtPrice, signedMoney } from '@/format';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import type { Timeframe } from '@/data/types';

const TIMEFRAMES: Timeframe[] = ['15m', '1H', '4H', '1D', '1W'];
const CHART_H = 230;
const AXIS_W = 56;

export default function ProChart() {
  const { symbol = 'BTC' } = useLocalSearchParams<{ symbol: string }>();
  const router = useRouter();
  // screens.md: 1H is the default (bolded in the pill row).
  const [tf, setTf] = useState(1);

  const { data, loading } = useAsync(
    () => repos.markets.candles(symbol, TIMEFRAMES[tf]!),
    [symbol, tf],
  );

  const bars = data?.bars ?? [];
  const proj = bars.length ? tight(bars) : null;
  const candles = proj ? projectCandles(bars, proj) : [];
  const volumes = projectVolume(volumeFromBars(bars));
  const last = bars.length ? bars[bars.length - 1]![3] : 0;
  const first = bars.length ? bars[0]![0] : 0;
  const changeAbs = last - first;
  const changePct = first ? (changeAbs / first) * 100 : 0;
  const up = changeAbs >= 0;
  const greenCloses = bars.filter((b) => b[3] >= b[0]).length;

  return (
    <Screen tabbed>
      <ScreenHeader
        left={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <IconButton
              name="back"
              accessibilityLabel="Back"
              background="transparent"
              color={ink.i55}
              onPress={() => router.back()}
            />
            <Text style={[type.cardTitleSm, { color: ink.full }]}>{symbol}/USD</Text>
            {data?.feed === 'simulated' ? <SimulatedTag /> : null}
          </View>
        }
      />

      <View style={{ marginTop: 18, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={[type.priceMedium, { color: ink.full }]}>{fmtPrice(last)}</Text>
          <View
            style={{
              backgroundColor: up ? pnl.upBg : pnl.downBg,
              borderRadius: 12,
              paddingHorizontal: 8,
              paddingVertical: 3,
            }}
          >
            <Text style={[type.rowDelta, { color: up ? pnl.up : pnl.down, fontWeight: '600' }]}>
              {percent(changePct, { digits: 2 })}
            </Text>
          </View>
        </View>
        <Text style={[type.secondaryMd, { color: ink.i40 }]}>
          {signedMoney(changeAbs)} today
        </Text>
      </View>

      <Screen.Content style={{ marginTop: 18 }}>
        {loading && !data ? (
          <LoadingRows count={3} height={70} />
        ) : (
          <>
            <View style={{ flexDirection: 'row', height: CHART_H }}>
              <View style={{ flex: 1, position: 'relative' }}>
                {/* 4 grid lines behind the candles. */}
                {[0.2, 0.4, 0.6, 0.8].map((t) => (
                  <View
                    key={t}
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: CHART_H * t,
                      height: hairlineWidth,
                      backgroundColor: borders.card,
                    }}
                  />
                ))}
                <Candlestick candles={candles} height={CHART_H} />
                {proj ? (
                  <MarkLine
                    topPct={proj.y(last)}
                    height={CHART_H}
                    label={fmtPrice(last)}
                    variant="dark"
                  />
                ) : null}
              </View>
              {/* Price axis — derived from the ACTIVE projection, never hardcoded. */}
              <View style={{ width: AXIS_W, justifyContent: 'space-between', paddingLeft: 8 }}>
                {(proj ? axisPrices(proj) : []).map((p, i) => (
                  <Text key={i} style={[type.footnoteSm, { color: ink.i28 }]}>
                    {axisLabel(p)}
                  </Text>
                ))}
              </View>
            </View>

            <View style={{ flexDirection: 'row', marginTop: 10 }}>
              <View style={{ flex: 1 }}>
                <VolumeRow values={volumes} ups={candles.map((c) => c.up)} />
              </View>
              <View style={{ width: AXIS_W }} />
            </View>
          </>
        )}
      </Screen.Content>

      <PillRow style={{ marginTop: 14, flexGrow: 0 }}>
        {TIMEFRAMES.map((t, i) => (
          <Pill key={t} label={t} selected={i === tf} onPress={() => setTf(i)} />
        ))}
      </PillRow>

      <NoteStrip kind={up ? 'acted' : 'risk'} style={{ marginTop: 16 }}>
        {/* Derived from the series on screen. The handoff's note quoted a fixed "$65.2K shelf",
            which read as nonsense once the live price moved anywhere near it. */}
        {bars.length === 0
          ? 'No live series for this market, so there is nothing for me to read.'
          : `${greenCloses} of the last ${bars.length} closes were up. Momentum Scout is watching the range high before it adds.`}
      </NoteStrip>

      <ButtonRow
        style={{ marginTop: 14 }}
        affirmativeFlex={1}
        secondary={<Button label="Short" variant="secondary" />}
        affirmative={<Button label="Long" variant="buy" />}
      />
    </Screen>
  );
}
