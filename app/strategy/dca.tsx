/**
 * DCA setup — PLAN.md 9.4. The headline feature of the pivot, and tier 1 of the ladder.
 *
 * White sheet, built from screen 14's ticket pattern (amount keypad + segmented controls)
 * plus a "next 3 runs" preview. One primary CTA.
 *
 * §1.2: "Buy $50 of WETH every Monday is verifiable by a user with no trading knowledge."
 * The next-runs preview exists so that verification is possible at the moment of setup,
 * not after the fact.
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useGoBack } from '@/nav/useGoBack';
import {
  Button,
  Eyebrow,
  Fill,
  IconButton,
  Keypad,
  Price,
  Screen,
  Segmented,
  Text,
  colors,
  money,
  radius,
  size,
  space,
} from '@/ui';
import { keypadPress } from '@/state/derived';
import { repos } from '@/data';
import { nextRuns } from '@/strategies/schedule';
import type { Cadence } from '@/data/types';

const CADENCES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 wks' },
  { value: 'monthly', label: 'Monthly' },
] as const satisfies readonly { value: Cadence; label: string }[];

/**
 * What a recurring buy can actually buy. These are the Base tokens the executor can route
 * through 1inch and settle through XorrDelegation — offering a symbol it cannot route would
 * let a user schedule a strategy that can never execute.
 */
const SYMBOLS = [
  { value: 'WETH', label: 'WETH' },
  { value: 'CBBTC', label: 'CBBTC' },
  { value: 'USDC', label: 'USDC' },
] as const;

type Symbol = (typeof SYMBOLS)[number]['value'];

/** The cadence in the sentence the CTA and the label both speak. */
function phrase(c: Cadence): string {
  return CADENCES.find((x) => x.value === c)!.label.toLowerCase();
}

export default function DcaSetup() {
  const goBack = useGoBack();
  const [amount, setAmount] = useState('50');
  const [cadence, setCadence] = useState<Cadence>('weekly');
  const [symbol, setSymbol] = useState<Symbol>('WETH');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const usd = parseFloat(amount || '0') || 0;
  const runs = useMemo(() => nextRuns(cadence, 3), [cadence]);
  const sentence = `${money(usd, { decimals: 0 })} of ${symbol}, ${phrase(cadence)}`;

  async function create() {
    if (usd <= 0) return;
    setBusy(true);
    setError(undefined);
    try {
      await repos.strategies.create({
        kind: 'dca',
        state: 'live',
        label: sentence,
        symbol,
        params: { usd },
        cadence,
        nextRunAt: runs[0]!.getTime(),
        dailyAllocationUsd: usd,
      });
      goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen light gutter="gutter">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="sheetTitle" color={colors.sheet.ink}>
          Recurring buy
        </Text>
        <IconButton
          name="close"
          accessibilityLabel="Close"
          onPress={() => goBack()}
          background="none"
          color={colors.sheet.ink}
          glyph={20}
        />
      </View>

      <Segmented
        options={SYMBOLS}
        value={symbol}
        onChange={setSymbol}
        light
        style={{ marginTop: space.s16 }}
      />

      <View style={{ alignItems: 'center', marginTop: space.s22, gap: space.s6 }}>
        <Price variant="heroAmount" color={colors.sheet.ink}>
          ${amount}
        </Price>
        <Text variant="body" color={colors.sheet.muted}>
          of {symbol}, {phrase(cadence)}
        </Text>
      </View>

      <Segmented
        options={CADENCES}
        value={cadence}
        onChange={setCadence}
        light
        height={size.segThumbSm}
        style={{ marginTop: space.s18 }}
      />

      <Fill style={{ marginTop: space.s8 }}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Keypad light onPress={(k) => setAmount((a) => keypadPress(a, k))} />

          {/* The whole point of tier 1: you can check the schedule before you agree to it. */}
          <View
            style={{
              backgroundColor: colors.sheet.fill,
              borderRadius: radius.tile,
              padding: space.s14,
              marginTop: space.s12,
              gap: space.s8,
            }}
          >
            <Eyebrow small color={colors.sheet.muted}>
              Next three runs
            </Eyebrow>
            {/*
              A schedule of nothing is not a schedule.

              With the amount cleared this listed three dated rows at $0 — a confident preview of
              three buys that would never happen, under a heading promising the opposite. The
              button is correctly disabled at that point; the panel above it was still making a
              claim. It asks for the amount instead.
            */}
            {usd <= 0 ? (
              <Text variant="body" color={colors.sheet.muted}>
                Enter an amount to see the schedule.
              </Text>
            ) : null}
            {usd > 0 && runs.map((d) => (
              <View
                key={d.toISOString()}
                style={{ flexDirection: 'row', justifyContent: 'space-between' }}
              >
                <Text variant="body" color={colors.sheet.ink}>
                  {d.toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
                <Price variant="body" color={colors.sheet.muted}>
                  {money(usd, { decimals: 0 })}
                </Price>
              </View>
            ))}
          </View>

          {error ? (
            <Text variant="secondarySm" color={colors.candleDown} style={{ marginTop: space.s12 }}>
              {error}
            </Text>
          ) : null}
        </ScrollView>
      </Fill>

      <Button
        label={`Buy ${sentence}`}
        backgroundColor={colors.candleUp}
        color={colors.ink}
        disabled={usd <= 0}
        loading={busy}
        onPress={create}
      />
      <Text
        variant="footnote"
        color={colors.sheet.dim}
        align="center"
        style={{ marginTop: space.s12 }}
      >
        Runs on schedule inside your daily cap. Pause or cancel any time.
      </Text>
    </Screen>
  );
}
