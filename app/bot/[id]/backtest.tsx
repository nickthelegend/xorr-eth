/**
 * Screen 17 — Backtest. screens.md Group C.
 *
 * Lookback pills 30d / 90d (default) / 6m / 1y. A 150pt equity curve with grid lines.
 * Four stat tiles: Return (up) / Max DD (down, U+2212) / Sharpe / Trades.
 * Card: "If you'd started with" + a capital stepper ($1k–$50k by $1k), then the projected
 * end value and the gain in `up`. Disclaimer: "Nothing here is a promise."
 *
 * The curve arrives as an equity SERIES now, not as an SVG polyline the executor drew —
 * see `server/src/backtest/engine.ts`. The chart projects it, which is the chart's job.
 */
import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useGoBack } from '@/nav/useGoBack';
import {
  AreaChart,
  Button,
  Fill,
  IconButton,
  LoadingRows,
  Pill,
  PillRow,
  Price,
  Screen,
  SheetCard,
  StatGrid,
  Stepper,
  Text,
  colors,
  pnlTone,
  money,
  radius,
  size,
  space,
} from '@/ui';
import { BT_CAPITAL_MAX, BT_CAPITAL_MIN, backtestSummary } from '@/state/derived';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import { useStore } from '@/state/store';
import type { BacktestResult } from '@/data/types';

const LOOKBACKS: BacktestResult['lookback'][] = ['30d', '90d', '6m', '1y'];
const CHART_H = 150;

export default function Backtest() {
  const { id = 'momentum-scout' } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const goBack = useGoBack();
  const btLook = useStore((s) => s.btLook);
  const setBtLook = useStore((s) => s.setBtLook);
  const btCapital = useStore((s) => s.btCapital);
  const bumpBtCapital = useStore((s) => s.bumpBtCapital);

  const { data, loading } = useAsync(
    () => repos.bot.backtest(id, LOOKBACKS[btLook]!),
    [id, btLook],
  );

  const summary = data ? backtestSummary(btCapital, data.ret, data.maxDd) : null;
  const tone = pnlTone(data?.ret ?? 0);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s8 }}>
        <IconButton
          name="back"
          accessibilityLabel="Back"
          background="none"
          onPress={() => goBack()}
        />
        <Text variant="screenTitle">Backtest</Text>
      </View>

      <Text variant="secondary" style={{ marginTop: space.s10 }}>
        Momentum Scout, run against real history at your current limits. Nothing here is a
        promise.
      </Text>

      <PillRow style={{ marginTop: space.s18, flexGrow: 0 }}>
        {LOOKBACKS.map((l, i) => (
          <Pill key={l} label={l} selected={i === btLook} onPress={() => setBtLook(i)} />
        ))}
      </PillRow>

      <Fill style={{ marginTop: space.s18 }}>
        {loading && !data ? (
          <LoadingRows count={3} height={size.row} />
        ) : data && summary ? (
          <>
            {data.equity.length > 1 ? (
              <AreaChart
                data={data.equity}
                height={CHART_H}
                color={tone === 'down' ? colors.down : colors.up}
                grid
                endDot
              />
            ) : (
              <View style={{ height: CHART_H, justifyContent: 'center' }}>
                <Text variant="secondary">No equity series came back for this range.</Text>
              </View>
            )}

            <StatGrid
              style={{ marginTop: space.s20 }}
              items={[
                { label: 'Return', value: summary.ret, color: colors.up },
                { label: 'Max DD', value: summary.dd, color: colors.down },
                { label: 'Sharpe', value: data.sharpe.toFixed(1) },
                { label: 'Trades', value: String(data.trades) },
              ]}
            />

            <SheetCard
              borderRadius={radius.panel}
              padding={space.s16}
              style={{ marginTop: space.s16 }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Text variant="rowPrimary">{`If you'd started with`}</Text>
                <Stepper
                  value={money(btCapital, { decimals: 0 })}
                  onDecrement={() => bumpBtCapital(-1)}
                  onIncrement={() => bumpBtCapital(1)}
                  canDecrement={btCapital > BT_CAPITAL_MIN}
                  canIncrement={btCapital < BT_CAPITAL_MAX}
                  valueMinWidth={84}
                />
              </View>
              <Price variant="amountMd" style={{ marginTop: space.s16 }}>
                {summary.end}
              </Price>
              <Price variant="body" tone={tone} style={{ marginTop: space.s4 }}>
                {summary.gain}
              </Price>
            </SheetCard>

            {/* Provenance and the disclaimer, both from the executor. A backtest without
                them is a sales pitch. */}
            <Text variant="footnote" color={colors.ink28} style={{ marginTop: space.s14 }}>
              {[data.source, data.disclaimer].filter(Boolean).join(' · ')}
            </Text>
          </>
        ) : null}
      </Fill>

      <Button label="Run this strategy live" onPress={() => router.push('/strategies')} />
    </Screen>
  );
}
