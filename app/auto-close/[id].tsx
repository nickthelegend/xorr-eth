/**
 * Screen 6 — Auto Close. screens.md Group B. WHITE SHEET.
 *
 * "Chart region flex:1; min-height:230px — THE CHART TAKES THE LEFTOVER HEIGHT, NOT A SPACER."
 * TP wash from the top, SL wash from the bottom, 12 candles on the WIDE projection, a
 * "Mark $66,560" chip at left, TP/SL marker rows at their projected prices.
 * Two control blocks (stepper with a coloured value pill, then a 22px ruler), gap 26.
 * Cancel (#E4F7EC on #16A254) / Set (#16C060).
 * Footnote "Make {tpPnl} at TP or lose {slPnl} at SL".
 */
import React, { useState } from 'react';
import { LayoutChangeEvent, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Candlestick, MarkLine, Ruler, projectCandles, tpSlBands, wide } from '@/charts';
import { Button, ButtonRow, Screen, Stepper , EmptyState, LoadingRows } from '@/design/components';
import { Icon } from '@/design/Icon';
import { pnl, sheet } from '@/design/colors';
import { type } from '@/design/type';
import { money, percent, price as fmtPrice } from '@/format';
import {
  lastClose,
  slPnl,
  slPrice,
  slTickPct,
  tpPnl,
  tpPrice,
  tpTickPct,
} from '@/state/derived';
import { useStore } from '@/state/store';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';

export default function AutoClose() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // TP/SL are set against the position's OWN market, on live candles. The handoff's static BTC
  // series meant a user editing a stop on an ETH position was reading a BTC chart.
  const position = useAsync(() => repos.portfolio.position(id!), [id]);
  const symbol = position.data?.symbol ?? 'BTC';
  const candles = useAsync(() => repos.markets.candles(symbol, '1H'), [symbol]);
  const bars = candles.data?.bars ?? [];
  const tp = useStore((s) => s.tp);
  const sl = useStore((s) => s.sl);
  const bumpTp = useStore((s) => s.bumpTp);
  const bumpSl = useStore((s) => s.bumpSl);
  const [chartH, setChartH] = useState(230);
  const [rulerW, setRulerW] = useState(300);

  // Everything is anchored to the live mark, not to the handoff's mid of 66,000.
  const mark = bars.length ? lastClose(bars) : 0;
  const tpP = tpPrice(tp, mark);
  const slP = slPrice(sl, mark);
  // The WIDE projection — its bounds follow TP/SL so both markers stay in frame at any setting.
  const proj = bars.length ? wide(bars, tpP, slP) : null;
  const projected = proj ? projectCandles(bars, proj) : [];
  const bands = proj ? tpSlBands(proj, tpP, slP) : null;
  // Size the P&L off the real position, not a fixed $2,500 notional.
  const size = position.data?.notional ?? 0;

  return (
    <Screen background={sheet.bg} sheetEdge gutter={false}>
      <View style={{ flex: 1, paddingHorizontal: 16 }}>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Text style={[type.sheetTitle, { color: sheet.ink }]}>Auto Close</Text>
          <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12}>
            <Icon name="close" size={20} color={sheet.ink} />
          </Pressable>
        </View>

        {/* THE LAYOUT LAW: flex:1 goes to the chart, never to a spacer. */}
        <Screen.Content style={{ minHeight: 230, marginTop: 18 }}>
          {!bars.length ? (
            candles.loading || position.loading ? (
              <LoadingRows count={3} height={62} />
            ) : (
              <EmptyState text={`No live ${symbol} series, so there is nothing to set against.`} />
            )
          ) : (
          <View
            style={{ flex: 1, position: 'relative' }}
            onLayout={(e: LayoutChangeEvent) => setChartH(e.nativeEvent.layout.height)}
          >
            {/* TP wash from the top down to TP. */}
            <View
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                height: `${bands!.tpZoneH}%`,
                backgroundColor: pnl.tpZone,
              }}
            />
            {/* SL wash from SL down to the bottom. */}
            <View
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: `${bands!.slZoneH}%`,
                backgroundColor: pnl.slZone,
              }}
            />
            <Candlestick candles={projected} height={chartH} />

            <MarkLine
              topPct={proj!.y(mark)}
              height={chartH}
              label={fmtPrice(mark)}
              variant="sheet"
              prefixed
            />
            <MarkerRow topPct={bands!.tpLineTop} height={chartH} label="Take Profit" price={fmtPrice(tpP)} color={pnl.candleUp} />
            <MarkerRow topPct={bands!.slLineTop} height={chartH} label="Stop Loss" price={fmtPrice(slP)} color={pnl.candleDown} />
          </View>
          )}

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
            {['1:30 PM', '5:30 PM', '10:00 PM'].map((t) => (
              <Text key={t} style={[type.footnoteSm, { color: sheet.dim }]}>
                {t}
              </Text>
            ))}
          </View>
        </Screen.Content>

        <View style={{ gap: 26, marginTop: 20 }} onLayout={(e) => setRulerW(e.nativeEvent.layout.width)}>
          <ControlBlock
            label="Take Profit"
            value={percent(tp)}
            pillColor={pnl.candleUp}
            onDec={() => bumpTp(-1)}
            onInc={() => bumpTp(1)}
            tickPct={tpTickPct(tp)}
            tickColor={pnl.candleUp}
            rulerW={rulerW}
          />
          <ControlBlock
            label="Stop Loss"
            value={percent(sl)}
            pillColor={pnl.candleDown}
            onDec={() => bumpSl(-1)}
            onInc={() => bumpSl(1)}
            tickPct={slTickPct(sl)}
            tickColor={pnl.candleDown}
            rulerW={rulerW}
          />
        </View>

        <ButtonRow
          style={{ marginTop: 22 }}
          affirmativeFlex={1}
          secondary={<Button label="Cancel" variant="sheetCancel" onPress={() => router.back()} />}
          affirmative={<Button label="Set" variant="sheetConfirm" onPress={() => router.back()} />}
        />

        <Text style={[type.footnote, { color: sheet.dim, textAlign: 'center', marginTop: 12 }]}>
          Make{' '}
          <Text style={{ color: pnl.candleUp, fontWeight: '600' }}>{money(tpPnl(tp, size))}</Text> at
          TP or lose{' '}
          <Text style={{ color: pnl.candleDown, fontWeight: '600' }}>{money(slPnl(sl, size))}</Text>{' '}
          at SL
        </Text>
      </View>
    </Screen>
  );
}

function MarkerRow({
  topPct,
  height,
  label,
  price,
  color,
}: {
  topPct: number;
  height: number;
  label: string;
  price: string;
  color: string;
}) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: (topPct / 100) * height,
        transform: [{ translateY: -11 }],
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <View
        style={{
          backgroundColor: color,
          borderRadius: 16,
          paddingHorizontal: 10,
          paddingVertical: 4,
        }}
      >
        <Text style={[type.tagSm, { color: '#FFFFFF', letterSpacing: 0, textTransform: 'none' }]}>
          {label}
        </Text>
      </View>
      <View
        style={{
          backgroundColor: color,
          borderRadius: 16,
          paddingHorizontal: 10,
          paddingVertical: 4,
        }}
      >
        <Text style={[type.tagSm, { color: '#FFFFFF', letterSpacing: 0, textTransform: 'none' }]}>
          {price}
        </Text>
      </View>
    </View>
  );
}

function ControlBlock({
  label,
  value,
  pillColor,
  onDec,
  onInc,
  tickPct,
  tickColor,
  rulerW,
}: {
  label: string;
  value: string;
  pillColor: string;
  onDec: () => void;
  onInc: () => void;
  tickPct: number;
  tickColor: string;
  rulerW: number;
}) {
  return (
    <View style={{ gap: 10 }}>
      <View
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Text style={[type.rowPrimary, { color: sheet.ink }]}>{label}</Text>
        <Stepper
          value={value}
          onDecrement={onDec}
          onIncrement={onInc}
          variant="sheet"
          valuePillColor={pillColor}
          valueInkColor="#FFFFFF"
          valueMinWidth={72}
          accessibilityLabel={label}
        />
      </View>
      <Ruler markerPct={tickPct} color={tickColor} width={rulerW} accessibilityLabel={`${label} position`} />
    </View>
  );
}
