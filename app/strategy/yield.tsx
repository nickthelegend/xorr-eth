/**
 * Move idle cash to yield — tier 4 of the ladder.
 *
 * The rung above take-profit and below range accumulation, and it earns that place by asking
 * the bot to forecast nothing: the rate is published, the venue is one contract, and every
 * move can be checked against app.aave.com. §1.2 — "every move is a published rate you can
 * check."
 *
 * Two numbers, and the second is the one that matters. "Sweep at most $X" is the size;
 * "always keep $Y spendable" is the promise that this strategy will not quietly starve every
 * other strategy the account has by supplying the balance they were counting on.
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
  percent,
  radius,
  size,
  space,
} from '@/ui';
import { keypadPress } from '@/state/derived';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import { nextRuns } from '@/strategies/schedule';
import type { Cadence } from '@/data/types';

const CADENCES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 wks' },
  { value: 'monthly', label: 'Monthly' },
] as const satisfies readonly { value: Cadence; label: string }[];

/** Buffers offered as one tap. The default is not zero — see the header comment. */
const KEEP_OPTIONS = [50, 100, 250, 500] as const;
const KEEPS = KEEP_OPTIONS.map((v) => ({ value: v as number, label: money(v, { decimals: 0 }) }));

/** Below this the gas costs more than the yield, so the strategy leaves the cash alone. */
const MIN_MOVE_USD = 25;

/** The cadence in the sentence the CTA and the label both speak. */
function phrase(c: Cadence): string {
  return CADENCES.find((x) => x.value === c)!.label.toLowerCase();
}

export default function YieldSetup() {
  const goBack = useGoBack();
  const [amount, setAmount] = useState('250');
  const [cadence, setCadence] = useState<Cadence>('daily');
  const [keepCashUsd, setKeepCashUsd] = useState<number>(100);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const rate = useAsync(() => repos.yield.staking(), []);
  const balance = useAsync(() => repos.portfolio.balance(), []);

  const usd = parseFloat(amount || '0') || 0;
  const runs = useMemo(() => nextRuns(cadence, 3), [cadence]);

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
        label: `Idle cash to Aave, ${phrase(cadence)}`,
        // The asset being swept is USDC. The venue is fixed and lives on the server, because a
        // pool address is not something a user should be asked to type.
        symbol: 'USDC',
        params: { usd, keepCashUsd, minMoveUsd: 25 },
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
    <Screen light>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="sheetTitle" color={colors.sheet.ink}>
          Idle cash to yield
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

      {/*
        The live rate, or an honest silence.

        A rate is the entire reason to run this strategy, so it is read from the Aave Pool
        rather than written into the design. Loading, unavailable and a real number are three
        different things and each says which one it is.
      */}
      <View
        style={{
          marginTop: space.s16,
          padding: space.s14,
          borderRadius: radius.tile,
          backgroundColor: colors.sheet.fill,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ flex: 1, paddingRight: space.s12 }}>
          <Eyebrow small color={colors.sheet.muted}>
            Aave v3 · USDC supply
          </Eyebrow>
          <Text variant="secondarySm" color={colors.sheet.muted} style={{ marginTop: space.s4 }}>
            {rate.loading
              ? 'Reading the pool…'
              : apy === undefined
                ? 'No live rate right now, so nothing will be moved.'
                : 'Floats with the pool. Not a promise.'}
          </Text>
        </View>
        <Price color={apy === undefined ? colors.sheet.muted : colors.up}>
          {rate.loading ? '…' : apy === undefined ? '—' : percent(apy * 100, 2).replace('+', '')}
        </Price>
      </View>

      <View style={{ alignItems: 'center', marginTop: space.s20, gap: space.s6 }}>
        <Price variant="heroAmount" color={colors.sheet.ink}>
          ${amount}
        </Price>
        <Text variant="body" color={colors.sheet.muted}>
          swept at most, {phrase(cadence)}
        </Text>
      </View>

      <Segmented
        options={CADENCES}
        value={cadence}
        onChange={setCadence}
        light
        height={size.segThumbSm}
        style={{ marginTop: space.s16 }}
      />

      <Fill style={{ marginTop: space.s8 }}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Keypad light onPress={(k) => setAmount((a) => keypadPress(a, k))} />

          <Eyebrow small color={colors.sheet.muted} style={{ marginTop: space.s14 }}>
            Always keep spendable
          </Eyebrow>
          <Segmented
            options={KEEPS}
            value={keepCashUsd}
            onChange={setKeepCashUsd}
            light
            height={size.segThumbSm}
            style={{ marginTop: space.s8 }}
          />

          {/* What it would do right now, against the real balance. */}
          <Card title="If it ran now">
            <StatRow
              label="Spendable cash"
              value={balance.loading ? '…' : cash === undefined ? '—' : money(cash)}
            />
            <StatRow label="Kept back" value={money(keepCashUsd)} />
            <StatRow
              label="Would move"
              value={
                balance.loading
                  ? '…'
                  : wouldMove === undefined
                    ? '—'
                    : wouldMove < MIN_MOVE_USD
                      ? 'nothing'
                      : money(wouldMove)
              }
              emphasis
            />
            {supplied > 0 ? <StatRow label="Already earning" value={money(supplied)} /> : null}
            {wouldMove !== undefined && wouldMove < MIN_MOVE_USD ? (
              <Text variant="footnote" color={colors.sheet.dim}>
                {`Below ${money(MIN_MOVE_USD, { decimals: 0 })} it leaves the cash alone — the gas costs more than the yield.`}
              </Text>
            ) : null}
          </Card>

          <Card title="Next three runs">
            {runs.map((d) => (
              <StatRow
                key={d.toISOString()}
                label={d.toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
                value={`up to ${money(usd, { decimals: 0 })}`}
              />
            ))}
          </Card>

          {error ? (
            <Text variant="secondarySm" color={colors.candleDown} style={{ marginTop: space.s12 }}>
              {error}
            </Text>
          ) : null}
        </ScrollView>
      </Fill>

      <Button
        label={`Sweep up to ${money(usd, { decimals: 0 })} ${phrase(cadence)}`}
        backgroundColor={colors.candleUp}
        color={colors.ink}
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
      <Text
        variant="footnote"
        color={colors.sheet.dim}
        align="center"
        style={{ marginTop: space.s12 }}
      >
        The bot can only supply. Withdrawing is yours alone, any time.
      </Text>
    </Screen>
  );
}

/** A pale panel on the light sheet. Three of these, all the same shape. */
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: colors.sheet.fill,
        borderRadius: radius.tile,
        padding: space.s14,
        marginTop: space.s14,
        gap: space.s8,
      }}
    >
      <Eyebrow small color={colors.sheet.muted}>
        {title}
      </Eyebrow>
      {children}
    </View>
  );
}

function StatRow({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text variant="body" color={colors.sheet.muted}>
        {label}
      </Text>
      <Price variant="body" color={emphasis ? colors.sheet.ink : colors.sheet.muted}>
        {value}
      </Price>
    </View>
  );
}
