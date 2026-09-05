/**
 * Screen 17 — Backtest. screens.md Group C.
 *
 * Lookback pills 30d / 90d (default) / 6m / 1y. 150px equity curve with 3 grid lines.
 * Four stat tiles: Return (up) / Max DD (down, U+2212) / Sharpe / Trades.
 * Card: "If you'd started with" + a capital stepper ($1k-$50k by $1k), then the projected end
 * value 30/700 and the gain in `up`.
 * Disclaimer: "Nothing here is a promise."
 */
import React from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AreaChart } from '@/charts';
import {
  Button,
  IconButton,
  LoadingRows,
  Pill,
  PillRow,
  Screen,
  ScreenHeader,
  SheetCard,
  Stepper,
} from '@/design/components';
import { borders, ink, pnl, surfaces } from '@/design/colors';
import { radius } from '@/design/space';
import { type } from '@/design/type';
import { money } from '@/format';
import { BT_CAPITAL_MAX, BT_CAPITAL_MIN, backtestSummary } from '@/state/derived';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import { useStore } from '@/state/store';
import type { BacktestResult } from '@/data/types';

const LOOKBACKS: BacktestResult['lookback'][] = ['30d', '90d', '6m', '1y'];

export default function Backtest() {
  const { id = 'momentum-scout' } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const btLook = useStore((s) => s.btLook);
  const setBtLook = useStore((s) => s.setBtLook);
  const btCapital = useStore((s) => s.btCapital);
  const bumpBtCapital = useStore((s) => s.bumpBtCapital);

  const { data, loading } = useAsync(
    () => repos.bot.backtest(id, LOOKBACKS[btLook]!),
    [id, btLook],
  );

  const summary = data ? backtestSummary(btCapital, data.ret, data.maxDd) : null;

  return (
    <Screen>
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
            <Text style={[type.screenTitle, { color: ink.full }]}>Backtest</Text>
          </View>
        }
      />

      <Text style={[type.secondary, { color: ink.i40, marginTop: 10 }]}>
        Momentum Scout, run against real history at your current limits. Nothing here is a promise.
      </Text>

      <PillRow style={{ marginTop: 18, flexGrow: 0 }}>
        {LOOKBACKS.map((l, i) => (
          <Pill key={l} label={l} selected={i === btLook} onPress={() => setBtLook(i)} />
        ))}
      </PillRow>

      <Screen.Content style={{ marginTop: 18 }}>
        {loading && !data ? (
          <LoadingRows count={3} height={60} />
        ) : data && summary ? (
          <>
            <AreaChart
              points={data.curve}
              height={150}
              stroke={pnl.up}
              accessibilityLabel={`Equity curve, ${data.lookback}`}
            />

            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                marginTop: 20,
                backgroundColor: borders.card,
                gap: 1,
                borderRadius: radius.md2,
                overflow: 'hidden',
              }}
            >
              <Tile label="Return" value={summary.ret} color={pnl.up} />
              <Tile label="Max DD" value={summary.dd} color={pnl.down} />
              <Tile label="Sharpe" value={data.sharpe.toFixed(1)} color={ink.full} />
              <Tile label="Trades" value={String(data.trades)} color={ink.full} />
            </View>

            <SheetCard radius={radius.xl} padding={16} style={{ marginTop: 16 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Text style={[type.rowPrimary, { color: ink.full }]}>{`If you'd started with`}</Text>
                <Stepper
                  value={money(btCapital, { fractionDigits: 0 })}
                  onDecrement={() => bumpBtCapital(-1)}
                  onIncrement={() => bumpBtCapital(1)}
                  canDecrement={btCapital > BT_CAPITAL_MIN}
                  canIncrement={btCapital < BT_CAPITAL_MAX}
                  valueMinWidth={84}
                  accessibilityLabel="Starting capital"
                />
              </View>
              <Text style={[type.valueLarge, { color: ink.full, marginTop: 16 }]}>
                {summary.end}
              </Text>
              <Text style={[type.body, { color: pnl.up, marginTop: 4 }]}>{summary.gain}</Text>
            </SheetCard>
          </>
        ) : null}
      </Screen.Content>

      <Button label="Run this strategy live" onPress={() => router.push('/strategies')} />
    </Screen>
  );
}

function Tile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View
      style={{
        width: '49.9%',
        backgroundColor: surfaces.bg,
        paddingVertical: 14,
        paddingHorizontal: 14,
        gap: 6,
      }}
    >
      <Text style={[type.footnoteSm, { color: ink.i32 }]}>{label}</Text>
      <Text style={[type.rowPrimaryLg, { color, fontWeight: '700' }]}>{value}</Text>
    </View>
  );
}
