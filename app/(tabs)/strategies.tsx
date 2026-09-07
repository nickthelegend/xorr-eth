/**
 * Strategies tab — NEW. PLAN.md 10.1 / §3.5.
 *
 * The handoff's "Trade" tab was never designed [G13]; the pivot gives it a job. Live
 * strategies with state, next run and capital committed; a library to add from, ordered by
 * the §1.2 ladder — DCA first, because it is the trust on-ramp.
 *
 * Built from Row / Segmented / SheetCard on `src/ui`. No new visual language.
 */
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Button,
  EmptyState,
  ErrorState,
  Fill,
  LoadingRows,
  Press,
  Price,
  Row,
  Screen,
  Segmented,
  SheetCard,
  Text,
  colors,
  money,
  radius,
  size,
  space,
} from '@/ui';
import { quantity } from '@/format';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import { useRefreshControl } from '@/ui/useRefreshControl';
import { STRATEGY_LADDER } from '@/strategies/ladder';
import type { Strategy } from '@/data/types';

type Tab = 'running' | 'library';

const TABS = [
  { value: 'running', label: 'Running' },
  { value: 'library', label: 'Add new' },
] as const satisfies readonly { value: Tab; label: string }[];

/** The tier badge on a library card. 22pt circle, per §5's small-marker recipe. */
const TIER = 22;

export default function Strategies() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('running');
  const { data, loading, error, reload } = useAsync(() => repos.strategies.list(), []);
  // Pulling down is the gesture people already try on a list of things that keep changing.
  const refresh = useRefreshControl(reload);

  const all = data ?? [];
  const live = all.filter((s) => s.state === 'live' || s.state === 'watch');
  /*
   * Paused strategies stay on this list.
   *
   * Filtering to live-only meant pausing one made it disappear, taking its Resume button
   * with it — a one-way door out of a state the user chose. The header count still says how
   * many are RUNNING, which is the number that matters; the list says what exists.
   */
  const paused = all.filter((s) => s.state === 'paused');
  const shown = [...live, ...paused];

  return (
    <Screen tabBar>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="screenTitle">Strategies</Text>
        <Text variant="footnote" color={colors.ink28}>
          {/* "0 running" is a claim. Without an answer from the executor we do not have one
              to make — the body below already shows why. */}
          {data === undefined ? '—' : `${live.length} running`}
        </Text>
      </View>

      <Text variant="secondary" style={{ marginTop: space.s10 }}>
        What the bot is allowed to do on its own, and what it is doing right now.
      </Text>

      <Segmented options={TABS} value={tab} onChange={setTab} style={{ marginTop: space.s18 }} />

      <Fill style={{ marginTop: space.s8 }}>
        <ScrollView refreshControl={refresh} showsVerticalScrollIndicator={false}>
          {tab === 'running' ? (
            loading && !data ? (
              <LoadingRows count={3} />
            ) : error ? (
              <ErrorState error={error} onRetry={reload} />
            ) : shown.length === 0 ? (
              <View style={{ gap: space.s16, paddingTop: space.s10 }}>
                <EmptyState text="Nothing running yet." />
                <Text variant="secondarySm" align="center">
                  A recurring buy is the simplest thing to hand over. You set the amount and
                  the day; the bot does nothing else.
                </Text>
                <Button label="Set up a recurring buy" onPress={() => router.push('/strategy/dca')} />
              </View>
            ) : (
              shown.map((s) => <StrategyRow key={s.id} s={s} onChanged={reload} />)
            )
          ) : (
            <View style={{ gap: space.s12, paddingTop: space.s6 }}>
              {STRATEGY_LADDER.map((entry) => (
                <SheetCard key={entry.kind} borderRadius={radius.panel} padding={space.s16}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s10 }}>
                    <View
                      style={{
                        width: TIER,
                        height: TIER,
                        borderRadius: radius.full,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: colors.surfaceAlt,
                      }}
                    >
                      {/* A tier number, so no uppercase tracking — it would push the digit
                          off centre in a circle this small. */}
                      <Text variant="tagSm" color={colors.ink55} style={{ letterSpacing: 0 }}>
                        {entry.tier}
                      </Text>
                    </View>
                    <Text variant="cardTitle" style={{ flex: 1 }}>
                      {entry.label}
                    </Text>
                    {entry.available ? null : (
                      <Text variant="footnote" color={colors.ink28}>
                        Later
                      </Text>
                    )}
                  </View>
                  <Text variant="secondarySm" color={colors.ink45} style={{ marginTop: space.s10 }}>
                    {entry.what}
                  </Text>
                  <Text variant="footnote" color={colors.ink32} style={{ marginTop: space.s8 }}>
                    {entry.judgement}
                  </Text>
                  {entry.available ? (
                    <Button
                      label={entry.cta}
                      variant="secondary"
                      height={size.ghostSm}
                      style={{ marginTop: space.s14 }}
                      onPress={() => router.push(entry.route as never)}
                    />
                  ) : null}
                </SheetCard>
              ))}
            </View>
          )}
        </ScrollView>
      </Fill>
    </Screen>
  );
}

/**
 * A running strategy, with the two things a user needs to be able to do to it.
 *
 * There was no way to stop one: a user could add strategies until they hit the daily cap and
 * then had no route out, which made the cap — working exactly as designed — read as the app
 * being broken. "Run now" exists because a weekly cadence is the point of the product and
 * useless for seeing that it works.
 */
function StrategyRow({ s, onChanged }: { s: Strategy; onChanged: () => void }) {
  const [busy, setBusy] = useState<'run' | 'pause' | undefined>();
  const [note, setNote] = useState<string>();

  const next = s.nextRunAt
    ? new Date(s.nextRunAt).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : '—';

  async function act(kind: 'run' | 'pause') {
    setBusy(kind);
    setNote(undefined);
    try {
      if (kind === 'pause') {
        await repos.strategies.setState(s.id, s.state === 'paused' ? 'live' : 'paused');
      } else {
        const r = await repos.strategies.runNow(s.id);
        // Say what happened. "Nothing to do" is a real and common outcome for a rebalance
        // that has not drifted, and it must not read as a failure.
        setNote(
          r.status === 'filled'
            ? `Filled ${quantity(r.units ?? 0)} at ${money(r.price ?? 0)}`
            : r.status === 'skipped'
              ? r.reason === 'already_ran_this_period'
                ? 'Already ran this period.'
                : 'Checked — nothing to do.'
              : (r.reason ?? r.status),
        );
      }
      onChanged();
    } catch (e) {
      setNote(e instanceof Error ? e.message.slice(0, 90) : String(e));
    } finally {
      setBusy(undefined);
    }
  }

  const isPaused = s.state === 'paused';
  return (
    <View>
      <Row
        title={s.label}
        secondary={`${s.state === 'watch' ? 'Watching · ' : ''}Next run ${next}`}
        value={<Price>{money(s.dailyAllocationUsd, { decimals: 0 })}</Price>}
        delta={isPaused ? 'Paused' : s.state === 'live' ? 'Live' : 'Watch'}
        // `Watch` and `Paused` are not losses — the P&L colours are reserved.
        deltaTone={!isPaused && s.state === 'live' ? 'up' : 'neutral'}
        height={size.rowLg}
      />
      <View
        style={{
          flexDirection: 'row',
          gap: space.s8,
          marginTop: -space.s4,
          marginBottom: space.s10,
        }}
      >
        <SmallAction
          label={busy === 'run' ? 'Running…' : 'Run now'}
          disabled={busy !== undefined || isPaused}
          onPress={() => void act('run')}
        />
        <SmallAction
          label={busy === 'pause' ? '…' : isPaused ? 'Resume' : 'Pause'}
          disabled={busy !== undefined}
          onPress={() => void act('pause')}
        />
      </View>
      {note ? (
        <Text
          variant="footnote"
          color={colors.ink45}
          style={{ marginTop: -space.s6, marginBottom: space.s10 }}
        >
          {note}
        </Text>
      ) : null}
    </View>
  );
}

function SmallAction({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={{
        // The target stays at the 44pt the design mandates even though the pill is shorter.
        minHeight: size.hit,
        justifyContent: 'center',
        paddingHorizontal: space.s14,
        borderRadius: radius.card,
        backgroundColor: colors.control,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text variant="control">{label}</Text>
    </Press>
  );
}
