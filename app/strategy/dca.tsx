/**
 * DCA setup — PLAN.md 9.4. The headline feature of the pivot, and tier 1 of the strategy ladder.
 *
 * White sheet, built from screen 14's ticket pattern (amount keypad + quick pills) plus a cadence
 * segmented control and a "next 3 runs" preview. One primary CTA.
 *
 * §1.2: "Buy $50 of SOL every Monday is verifiable by a user with no trading knowledge." The next-
 * runs preview exists so that verification is possible at the moment of setup, not after the fact.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '@/design/Icon';
import { Button, Screen, Segmented } from '@/design/components';
import { pnl, sheet } from '@/design/colors';
import { radius } from '@/design/space';
import { type } from '@/design/type';
import { money } from '@/format';
import { keypadPress } from '@/state/derived';
import { repos } from '@/data';
import { nextRuns } from '@/strategies/schedule';
import type { Cadence } from '@/data/types';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];
const CADENCES: Cadence[] = ['daily', 'weekly', 'biweekly', 'monthly'];
const CADENCE_LABELS = ['Daily', 'Weekly', 'Every 2 wks', 'Monthly'];
const SYMBOLS = ['SOL', 'BTC', 'ETH'];

export default function DcaSetup() {
  const router = useRouter();
  const [amount, setAmount] = useState('50');
  const [cadence, setCadence] = useState(1);
  const [symbolIdx, setSymbolIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const usd = parseFloat(amount || '0') || 0;
  const symbol = SYMBOLS[symbolIdx]!;
  const runs = useMemo(() => nextRuns(CADENCES[cadence]!, 3), [cadence]);

  async function create() {
    if (usd <= 0) return;
    setBusy(true);
    setError(undefined);
    try {
      await repos.strategies.create({
        kind: 'dca',
        state: 'live',
        label: `${money(usd, { fractionDigits: 0 })} of ${symbol}, ${CADENCE_LABELS[cadence]!.toLowerCase()}`,
        symbol,
        params: { usd },
        cadence: CADENCES[cadence],
        nextRunAt: runs[0]!.getTime(),
        dailyAllocationUsd: usd,
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
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Text style={[type.sheetTitle, { color: sheet.ink }]}>Recurring buy</Text>
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

        <View style={{ alignItems: 'center', marginTop: 22, gap: 6 }}>
          <Text style={[type.heroAmount, { color: sheet.ink }]}>${amount}</Text>
          <Text style={[type.body, { color: sheet.muted }]}>
            of {symbol}, {CADENCE_LABELS[cadence]!.toLowerCase()}
          </Text>
        </View>

        <Segmented
          options={CADENCE_LABELS}
          value={cadence}
          onChange={setCadence}
          variant="sheet"
          height={36}
          style={{ marginTop: 18 }}
          accessibilityLabel="How often"
        />

        <Screen.Content style={{ marginTop: 8 }}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {KEYS.map((k) => (
                <Pressable
                  key={k}
                  onPress={() => setAmount((a) => keypadPress(a, k))}
                  accessibilityRole="button"
                  accessibilityLabel={k === '⌫' ? 'Delete' : k}
                  style={({ pressed }) => ({
                    width: '33.333%',
                    height: 52,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: radius.md,
                    backgroundColor: pressed ? sheet.fill : 'transparent',
                  })}
                >
                  <Text style={{ fontSize: 24, fontWeight: '500', color: sheet.ink }}>{k}</Text>
                </Pressable>
              ))}
            </View>

            {/* The whole point of tier 1: you can check the schedule before you agree to it. */}
            <View
              style={{
                backgroundColor: sheet.fill,
                borderRadius: radius.md2,
                padding: 14,
                marginTop: 12,
                gap: 8,
              }}
            >
              <Text style={[type.eyebrowSm, { color: sheet.muted }]}>Next three runs</Text>
              {runs.map((d) => (
                <View
                  key={d.toISOString()}
                  style={{ flexDirection: 'row', justifyContent: 'space-between' }}
                >
                  <Text style={[type.body, { color: sheet.ink }]}>
                    {d.toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </Text>
                  <Text style={[type.body, { color: sheet.muted }]}>
                    {money(usd, { fractionDigits: 0 })}
                  </Text>
                </View>
              ))}
            </View>

            {error ? (
              <Text style={[type.noteBody, { color: pnl.candleDown, marginTop: 12 }]}>{error}</Text>
            ) : null}
          </ScrollView>
        </Screen.Content>

        <Button
          label={`Buy ${money(usd, { fractionDigits: 0 })} of ${symbol}, ${CADENCE_LABELS[cadence]!.toLowerCase()}`}
          variant="sheetConfirm"
          disabled={usd <= 0}
          loading={busy}
          onPress={create}
        />
        <Text
          style={[type.footnote, { color: sheet.dim, textAlign: 'center', marginTop: 12 }]}
        >
          Runs on schedule inside your daily cap. Pause or cancel any time.
        </Text>
      </View>
    </Screen>
  );
}
