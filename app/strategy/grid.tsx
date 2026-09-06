/**
 * Range accumulation — tier 5.
 *
 * The user draws a band; the bot buys a rung lower and sells a rung higher inside it. It is the
 * first tier that ASSUMES something — that the range holds — which is why it sits above the ones
 * that assume nothing, and why this screen puts the assumption on the screen rather than in a
 * footnote. A range that breaks leaves you holding everything bought on the way down.
 *
 * The rungs are drawn against the live price, because a range is a claim about where the price is
 * going to stay and you cannot judge one without seeing where it is now.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '@/design/Icon';
import { Button, Screen, Segmented } from '@/design/components';
import { pnl, sheet } from '@/design/colors';
import { radius } from '@/design/space';
import { type } from '@/design/type';
import { money } from '@/format';
import { repos } from '@/data';
import { usePrices } from '@/data/usePrices';
import { useAsync } from '@/data/useAsync';
import { api } from '@/data/api';

import { nextRuns } from '@/strategies/schedule';
import type { Cadence } from '@/data/types';

type GridBacktest = {
  inRangePct: number;
  buys: number;
  sells: number;
  ret: number;
  leftValue: number;
  leftCost: number;
  disclaimer: string;
};

const SYMBOLS = ['WETH', 'CBBTC'];
const STEP_OPTIONS = [2, 4, 6, 8];
const CADENCES: Cadence[] = ['daily', 'weekly'];
const CADENCE_LABELS = ['Check daily', 'Check weekly'];

export default function GridSetup() {
  const router = useRouter();
  const [symbolIdx, setSymbolIdx] = useState(0);
  const symbol = SYMBOLS[symbolIdx]!;
  const { quotes } = usePrices([symbol]);
  const mark = quotes[symbol]?.price;

  const [lower, setLower] = useState('');
  const [upper, setUpper] = useState('');
  const [stepIdx, setStepIdx] = useState(1);
  const [perRung, setPerRung] = useState('50');
  const [cadence, setCadence] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const steps = STEP_OPTIONS[stepIdx]!;
  const lo = parseFloat(lower) || 0;
  const hi = parseFloat(upper) || 0;
  const usdPerStep = parseFloat(perRung) || 0;
  const runs = useMemo(() => nextRuns(CADENCES[cadence]!, 3), [cadence]);

  /*
   * The backtest is on demand, not automatic.
   *
   * It costs a call to a rate-limited history API, and re-running it on every keystroke while
   * someone types a range would spend that quota on ranges they are still in the middle of
   * deciding — and could take the live prices down with it.
   */
  const [testNonce, setTestNonce] = useState(0);
  const back = useAsync(async () => {
    if (testNonce === 0) return null;
    return api.post<GridBacktest>('/strategies/backtest', {
      kind: 'grid',
      symbol,
      lookback: '90d',
      params: { lower: lo, upper: hi, steps, usdPerStep },
    });
  }, [testNonce]);
  const runBacktest = () => setTestNonce((n) => n + 1);


  /*
   * Suggest a band around the live price rather than making someone guess in the dark.
   * ±12% is wide enough to hold through ordinary movement and narrow enough that the rungs are
   * meaningfully apart — but it is a starting point that can be typed over, not a default the
   * bot chose for them.
   */
  const suggest = () => {
    if (!mark) return;
    setLower(Math.round(mark * 0.88).toString());
    setUpper(Math.round(mark * 1.12).toString());
  };

  const rungs = useMemo(() => {
    if (!(lo > 0) || !(hi > lo)) return [];
    return Array.from({ length: steps + 1 }, (_, i) => lo + (i * (hi - lo)) / steps);
  }, [lo, hi, steps]);

  const valid = rungs.length > 0 && usdPerStep >= 5;
  const inRange = mark !== undefined && mark >= lo && mark <= hi;
  const maxCommitted = usdPerStep * steps;

  async function create() {
    if (!valid) return;
    setBusy(true);
    setError(undefined);
    try {
      await repos.strategies.create({
        kind: 'grid',
        state: 'live',
        label: `${symbol} ${money(lo, { fractionDigits: 0 })}–${money(hi, { fractionDigits: 0 })}`,
        symbol,
        params: { lower: lo, upper: hi, steps, usdPerStep },
        cadence: CADENCES[cadence],
        nextRunAt: runs[0]!.getTime(),
        // The most it can ever have at work: one rung per level, and never more than that.
        dailyAllocationUsd: maxCommitted,
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen background={sheet.bg} sheetEdge gutter={false}>
      <View style={{ flex: 1, paddingHorizontal: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={[type.sheetTitle, { color: sheet.ink }]}>Range accumulation</Text>
          <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12}>
            <Icon name="close" size={20} color={sheet.ink} />
          </Pressable>
        </View>

        <Segmented
          options={SYMBOLS}
          value={symbolIdx}
          onChange={setSymbolIdx}
          variant="sheet"
          style={{ marginTop: 16 }}
          accessibilityLabel="Asset"
        />

        <View
          style={{
            marginTop: 16,
            padding: 14,
            borderRadius: radius.md2,
            backgroundColor: sheet.fill,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text style={[type.body, { color: sheet.muted }]}>{symbol} right now</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={[type.rowPrimary, { color: sheet.ink }]}>
              {mark === undefined ? '—' : money(mark)}
            </Text>
            {mark !== undefined ? (
              <Pressable onPress={suggest} accessibilityRole="button" accessibilityLabel="Suggest a range around the current price">
                <Text style={[type.pill, { color: pnl.cancelInk }]}>Suggest</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <Screen.Content style={{ marginTop: 14 }}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Field label="Bottom of range" value={lower} onChange={setLower} />
              <Field label="Top of range" value={upper} onChange={setUpper} />
            </View>

            <Text style={[type.eyebrowSm, { color: sheet.muted, marginTop: 18 }]}>RUNGS</Text>
            <Segmented
              options={STEP_OPTIONS.map(String)}
              value={stepIdx}
              onChange={setStepIdx}
              variant="sheet"
              height={36}
              style={{ marginTop: 8 }}
              accessibilityLabel="How many rungs"
            />

            <View style={{ marginTop: 16 }}>
              <Field label="Each rung buys" value={perRung} onChange={setPerRung} />
            </View>

            {/* The ladder, drawn. A range is only judgeable next to the price it is a claim about. */}
            {rungs.length > 0 ? (
              <View
                style={{
                  backgroundColor: sheet.fill,
                  borderRadius: radius.md2,
                  padding: 14,
                  marginTop: 18,
                  gap: 7,
                }}
              >
                <Text style={[type.eyebrowSm, { color: sheet.muted }]}>THE LADDER</Text>
                {[...rungs].reverse().map((r, idx) => {
                  const isNearest =
                    mark !== undefined &&
                    Math.abs(r - mark) === Math.min(...rungs.map((x) => Math.abs(x - mark)));
                  return (
                    <View
                      key={r}
                      style={{ flexDirection: 'row', justifyContent: 'space-between' }}
                    >
                      <Text
                        style={[
                          type.body,
                          { color: isNearest ? sheet.ink : sheet.muted },
                        ]}
                      >
                        {money(r)}
                        {isNearest ? '  ← price is here' : ''}
                      </Text>
                      <Text style={[type.body, { color: sheet.muted }]}>
                        {idx === 0 ? 'sell' : idx === rungs.length - 1 ? 'buy' : ''}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {/*
              What this range would have done, over real history.
              A grid's entire risk is the assumption in its own description — that the range holds
              — and that is a question about the past, not a forecast. "In range 41% of the last
              ninety days" is something a projection can never tell you.
            */}
            {rungs.length > 0 ? (
              <View
                style={{
                  backgroundColor: sheet.fill,
                  borderRadius: radius.md2,
                  padding: 14,
                  marginTop: 16,
                  gap: 8,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={[type.eyebrowSm, { color: sheet.muted }]}>OVER THE LAST 90 DAYS</Text>
                  {!back.data && !back.loading ? (
                    <Pressable onPress={runBacktest} accessibilityRole="button" accessibilityLabel="Test this range against real history">
                      <Text style={[type.pill, { color: pnl.cancelInk }]}>Test it</Text>
                    </Pressable>
                  ) : null}
                </View>
                {back.loading ? (
                  <Text style={[type.body, { color: sheet.muted }]}>Replaying real prices…</Text>
                ) : back.error ? (
                  <Text style={[type.noteBody, { color: pnl.candleDown }]}>
                    No price history for {symbol}, so there is nothing to test against.
                  </Text>
                ) : back.data ? (
                  <>
                    <Text style={[type.rowPrimaryLg, { color: sheet.ink }]}>
                      In range {back.data.inRangePct}% of the time
                    </Text>
                    <Text style={[type.noteBody, { color: sheet.muted }]}>
                      {back.data.buys} buys and {back.data.sells} sells, {back.data.ret >= 0 ? 'up' : 'down'}{' '}
                      {Math.abs(back.data.ret)}% on what it put to work.
                    </Text>
                    {back.data.leftCost > 0 ? (
                      <Text style={[type.noteBody, { color: pnl.candleDown }]}>
                        It would have ended still holding {money(back.data.leftValue)} of {symbol}
                        {' '}that cost {money(back.data.leftCost)} — that is what a broken range
                        looks like.
                      </Text>
                    ) : null}
                    <Text style={[type.footnote, { color: sheet.dim }]}>{back.data.disclaimer}</Text>
                  </>
                ) : (
                  <Text style={[type.noteBody, { color: sheet.muted }]}>
                    Replay this exact range over real daily closes before you commit to it.
                  </Text>
                )}
              </View>
            ) : null}

            {/* The two things that decide whether this is a good idea. Neither is a footnote. */}
            <View style={{ marginTop: 16, gap: 8 }}>
              <Text style={[type.noteBody, { color: sheet.muted }]}>
                At most {money(maxCommitted)} at work — one rung each, and it never buys the same
                rung twice.
              </Text>
              <Text style={[type.noteBody, { color: sheet.muted }]}>
                If {symbol} leaves the range it stops rather than chasing. You keep whatever it
                bought on the way down, which is the risk you are taking.
              </Text>
              {rungs.length > 0 && !inRange && mark !== undefined ? (
                <Text style={[type.noteBody, { color: pnl.candleDown }]}>
                  {money(mark)} is outside this range, so nothing would happen until it comes back.
                </Text>
              ) : null}
            </View>

            <Segmented
              options={CADENCE_LABELS}
              value={cadence}
              onChange={setCadence}
              variant="sheet"
              height={36}
              style={{ marginTop: 18, marginBottom: 8 }}
              accessibilityLabel="How often to check"
            />

            {error ? (
              <Text style={[type.noteBody, { color: pnl.candleDown, marginTop: 12 }]}>{error}</Text>
            ) : null}
          </ScrollView>
        </Screen.Content>

        <Button
          label={valid ? `Run this range on ${symbol}` : 'Set a range and a rung size'}
          variant="sheetConfirm"
          disabled={!valid}
          loading={busy}
          onPress={create}
        />
        <Text style={[type.footnote, { color: sheet.dim, textAlign: 'center', marginTop: 12 }]}>
          The first run takes a reading. Trades start on the first crossing after that.
        </Text>
      </View>
    </Screen>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[type.eyebrowSm, { color: sheet.muted }]}>{label.toUpperCase()}</Text>
      <View
        style={{
          marginTop: 8,
          height: 46,
          borderRadius: radius.md2,
          backgroundColor: sheet.fill,
          paddingHorizontal: 12,
          justifyContent: 'center',
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={sheet.dim}
          accessibilityLabel={label}
          style={[type.rowPrimary, { color: sheet.ink }]}
        />
      </View>
    </View>
  );
}
