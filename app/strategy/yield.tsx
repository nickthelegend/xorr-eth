/**
 * Move idle cash to yield — tier 4 of the ladder.
 *
 * The rung above take-profit and below range accumulation, and it earns that place by asking the
 * bot to forecast nothing: the rate is published, the venue is one contract, and every move can be
 * checked against app.aave.com. §1.2 — "every move is a published rate you can check."
 *
 * Two numbers, and the second is the one that matters. "Sweep at most $X" is the size; "always
 * keep $Y spendable" is the promise that this strategy will not quietly starve every other
 * strategy the account has by supplying the balance they were counting on.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '@/design/Icon';
import { Button, Screen, Segmented } from '@/design/components';
import { ink, pnl, sheet } from '@/design/colors';
import { radius } from '@/design/space';
import { type } from '@/design/type';
import { money, percent } from '@/format';
import { keypadPress } from '@/state/derived';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import { nextRuns } from '@/strategies/schedule';
import type { Cadence } from '@/data/types';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];
const CADENCES: Cadence[] = ['daily', 'weekly', 'biweekly', 'monthly'];
const CADENCE_LABELS = ['Daily', 'Weekly', 'Every 2 wks', 'Monthly'];
/** Buffers offered as one tap. The default is not zero — see the header comment. */
const KEEP_OPTIONS = [50, 100, 250, 500];

export default function YieldSetup() {
  const router = useRouter();
  const [amount, setAmount] = useState('250');
  const [cadence, setCadence] = useState(0);
  const [keepIdx, setKeepIdx] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const rate = useAsync(() => repos.yield.staking(), []);
  const balance = useAsync(() => repos.portfolio.balance(), []);

  const usd = parseFloat(amount || '0') || 0;
  const keepCashUsd = KEEP_OPTIONS[keepIdx]!;
  const runs = useMemo(() => nextRuns(CADENCES[cadence]!, 3), [cadence]);

  const cash = balance.data?.cash;
  const supplied = balance.data?.supplied ?? 0;
  /*
   * What this run would actually move, given what is there right now.
   *
   * Showing the configured amount when the wallet cannot cover it is the sort of small lie that
   * makes a user think the bot failed. The strategy sweeps `min(idle, amount)` and does nothing at
   * all below the floor, so the preview says the same.
   */
  const idle = cash === undefined ? undefined : Math.max(cash - keepCashUsd, 0);
  const wouldMove = idle === undefined ? undefined : Math.min(idle, usd);
  const apy = rate.data?.estimatedApy;

  async function create() {
    if (usd <= 0) return;
    setBusy(true);
    setError(undefined);
    try {
      await repos.strategies.create({
        kind: 'yield-rotation',
        state: 'live',
        label: `Idle cash to Aave, ${CADENCE_LABELS[cadence]!.toLowerCase()}`,
        // The asset being swept is USDC. The venue is fixed and lives on the server, because a
        // pool address is not something a user should be asked to type.
        symbol: 'USDC',
        params: { usd, keepCashUsd, minMoveUsd: 25 },
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
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={[type.sheetTitle, { color: sheet.ink }]}>Idle cash to yield</Text>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={12}
          >
            <Icon name="close" size={20} color={sheet.ink} />
          </Pressable>
        </View>

        {/*
          The live rate, or an honest silence.

          A rate is the entire reason to run this strategy, so it is read from the Aave Pool rather
          than written into the design. Loading, unavailable and a real number are three different
          things and each says which one it is.
        */}
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
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={[type.eyebrowSm, { color: sheet.muted }]}>Aave v3 · USDC supply</Text>
            <Text style={[type.noteBody, { color: sheet.muted, marginTop: 4 }]}>
              {rate.loading
                ? 'Reading the pool…'
                : apy === undefined
                  ? 'No live rate right now, so nothing will be moved.'
                  : 'Floats with the pool. Not a promise.'}
            </Text>
          </View>
          <Text style={[type.rowPrimary, { color: apy === undefined ? sheet.muted : pnl.up }]}>
            {rate.loading ? '…' : apy === undefined ? '—' : percent(apy * 100, { digits: 2 }).replace('+', '')}
          </Text>
        </View>

        <View style={{ alignItems: 'center', marginTop: 20, gap: 6 }}>
          <Text style={[type.heroAmount, { color: sheet.ink }]}>${amount}</Text>
          <Text style={[type.body, { color: sheet.muted }]}>
            swept at most, {CADENCE_LABELS[cadence]!.toLowerCase()}
          </Text>
        </View>

        <Segmented
          options={CADENCE_LABELS}
          value={cadence}
          onChange={setCadence}
          variant="sheet"
          height={36}
          style={{ marginTop: 16 }}
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

            <Text style={[type.eyebrowSm, { color: sheet.muted, marginTop: 14 }]}>
              Always keep spendable
            </Text>
            <Segmented
              options={KEEP_OPTIONS.map((v) => money(v, { fractionDigits: 0 }))}
              value={keepIdx}
              onChange={setKeepIdx}
              variant="sheet"
              height={36}
              style={{ marginTop: 8 }}
              accessibilityLabel="Cash buffer to keep"
            />

            {/* What it would do right now, against the real balance. */}
            <View
              style={{
                backgroundColor: sheet.fill,
                borderRadius: radius.md2,
                padding: 14,
                marginTop: 14,
                gap: 8,
              }}
            >
              <Text style={[type.eyebrowSm, { color: sheet.muted }]}>If it ran now</Text>
              <Row
                label="Spendable cash"
                value={
                  balance.loading ? '…' : cash === undefined ? '—' : money(cash)
                }
              />
              <Row label="Kept back" value={money(keepCashUsd)} />
              <Row
                label="Would move"
                value={
                  balance.loading
                    ? '…'
                    : wouldMove === undefined
                      ? '—'
                      : wouldMove < 25
                        ? 'nothing'
                        : money(wouldMove)
                }
                emphasis
              />
              {supplied > 0 ? (
                <Row label="Already earning" value={money(supplied)} />
              ) : null}
              {wouldMove !== undefined && wouldMove < 25 ? (
                <Text style={[type.footnote, { color: sheet.dim }]}>
                  Below $25 it leaves the cash alone — the gas costs more than the yield.
                </Text>
              ) : null}
            </View>

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
                <Row
                  key={d.toISOString()}
                  label={d.toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                  value={`up to ${money(usd, { fractionDigits: 0 })}`}
                />
              ))}
            </View>

            {error ? (
              <Text style={[type.noteBody, { color: pnl.candleDown, marginTop: 12 }]}>{error}</Text>
            ) : null}
          </ScrollView>
        </Screen.Content>

        <Button
          label={`Sweep up to ${money(usd, { fractionDigits: 0 })} ${CADENCE_LABELS[cadence]!.toLowerCase()}`}
          variant="sheetConfirm"
          disabled={usd <= 0}
          loading={busy}
          onPress={create}
        />
        {/*
          The exit, said up front.

          Supplying is the only thing the bot can do here: the receipt token is yours and it was
          never approved for the delegation to move, so withdrawing is a signature only you can
          make. Saying so at setup is the difference between a permission and a trap.
        */}
        <Text style={[type.footnote, { color: sheet.dim, textAlign: 'center', marginTop: 12 }]}>
          The bot can only supply. Withdrawing is yours alone, any time.
        </Text>
      </View>
    </Screen>
  );
}

function Row({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={[type.body, { color: sheet.muted }]}>{label}</Text>
      <Text style={[type.body, { color: emphasis ? sheet.ink : sheet.muted }]}>{value}</Text>
    </View>
  );
}
