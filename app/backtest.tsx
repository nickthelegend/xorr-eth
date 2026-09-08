/**
 * What a recurring buy would have done, before you commit money to it.
 *
 * Agents had a backtest and strategies did not, which is backwards: an agent is a persona and a
 * strategy is the thing that actually spends. Running one before creating it is the difference
 * between a plan and a guess.
 *
 * Everything the server sends about the run's provenance is rendered — the window, where the prices
 * came from, and the disclaimer. A backtest without those is a sales pitch, and the server sends
 * them precisely so the client cannot quietly drop them.
 *
 * It creates nothing. This is a calculation over past prices, and the strategy screens are where
 * something gets made.
 */
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useGoBack } from '@/nav/useGoBack';
import {
  AreaChart,
  Button,
  ErrorState,
  Fill,
  HeaderBar,
  Pill,
  PillRow,
  Placeholder,
  Price,
  Screen,
  SheetCard,
  Text,
  colors,
  pnlTone,
  radius,
  space,
} from '@/ui';
import { money, percent } from '@/format';
import { TRADABLE } from '@/data/tradable';
import { system, type StrategyBacktest } from '@/data/system';

const LOOKBACKS = ['30d', '90d', '6m', '1y'] as const;
const SIZES = [25, 50, 100, 250] as const;
const CHART_H = 130;

export default function Backtest() {
  const goBack = useGoBack();
  const [symbol, setSymbol] = useState<string>('WETH');
  const [lookback, setLookback] = useState<(typeof LOOKBACKS)[number]>('90d');
  const [usd, setUsd] = useState<number>(SIZES[1]);

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<StrategyBacktest | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(
        await system.backtestStrategy({
          kind: 'dca',
          symbol,
          lookback,
          // Weekly, which is what the DCA creator defaults to — a backtest of a cadence nobody
          // would choose answers a question nobody asked.
          params: { usd, everyNDays: 7 },
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen gutter="none">
      <View style={{ paddingHorizontal: space.gutter }}>
        <HeaderBar onBack={goBack} title={<Text variant="screenTitle">Backtest</Text>} />
        <Text variant="secondary" color={colors.ink40} style={{ marginTop: space.s8 }}>
          A weekly buy, over real past prices. Nothing is created.
        </Text>
      </View>

      <Fill style={{ marginTop: space.s12 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: space.s30 }}
        >
          <PillRow style={{ marginTop: space.s8 }} contentPadding={space.gutter}>
            {TRADABLE.map((t) => (
              <Pill key={t} label={t} selected={t === symbol} onPress={() => setSymbol(t)} />
            ))}
          </PillRow>

          <PillRow style={{ marginTop: space.s10 }} contentPadding={space.gutter}>
            {LOOKBACKS.map((l) => (
              <Pill key={l} label={l} selected={l === lookback} onPress={() => setLookback(l)} />
            ))}
          </PillRow>

          <PillRow style={{ marginTop: space.s10 }} contentPadding={space.gutter}>
            {SIZES.map((s) => (
              <Pill key={s} label={money(s)} selected={s === usd} onPress={() => setUsd(s)} />
            ))}
          </PillRow>

          <View style={{ paddingHorizontal: space.gutter, marginTop: space.s16, gap: space.s12 }}>
            <Button label={busy ? 'Running…' : 'Run it'} disabled={busy} onPress={run} />

            {error ? (
              <ErrorState error={error} onRetry={run} />
            ) : busy ? (
              <Placeholder height={CHART_H} />
            ) : !result ? (
              <Text variant="secondarySm" color={colors.ink40}>
                Pick a market, a window and a size. The result is computed from daily closes the
                executor already holds, not from a model.
              </Text>
            ) : (
              <>
                {result.equity.length > 1 ? (
                  <AreaChart
                    data={result.equity}
                    height={CHART_H}
                    color={result.ret >= 0 ? colors.up : colors.down}
                    endDot
                  />
                ) : null}

                <SheetCard bordered borderRadius={radius.panel} padding={space.s16}>
                  <Text variant="footnote" color={colors.ink40}>
                    RETURN
                  </Text>
                  <Price variant="screenTitle" tone={pnlTone(result.ret)} style={{ marginTop: space.s6 }}>
                    {percent(result.ret)}
                  </Price>
                  <Text variant="secondarySm" color={colors.ink40} style={{ marginTop: space.s10 }}>
                    Worst drawdown {percent(result.maxDd, { explicitSign: false })} · {result.trades}{' '}
                    buys
                  </Text>
                </SheetCard>

                <SheetCard bordered borderRadius={radius.panel} padding={space.s14}>
                  {/*
                    Provenance, rendered rather than dropped. The server sends these three fields
                    for exactly this reason, and a client that keeps the return and discards the
                    caveat has turned a calculation into a claim.
                  */}
                  <Text variant="footnote" color={colors.ink40}>
                    {result.source}
                  </Text>
                  <Text variant="secondarySm" color={colors.ink40} style={{ marginTop: space.s8 }}>
                    {result.disclaimer}
                  </Text>
                </SheetCard>
              </>
            )}
          </View>
        </ScrollView>
      </Fill>
    </Screen>
  );
}
