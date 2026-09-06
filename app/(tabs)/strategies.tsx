/**
 * Strategies tab — NEW. PLAN.md 10.1 / §3.5.
 *
 * The handoff's "Trade" tab was never designed [G13]; the pivot gives it a job. Live strategies
 * with state, next run, capital committed; a library to add from, ordered by the §1.2 ladder —
 * DCA first, because it is the trust on-ramp.
 *
 * Built from Row / Pill / Segmented / SheetCard. No new visual language.
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingRows,
  Row,
  Screen,
  ScreenHeader,
  Segmented,
  SheetCard,
} from '@/design/components';
import { ink, pnl, surfaces } from '@/design/colors';
import { MIN_HIT, radius } from '@/design/space';
import { type } from '@/design/type';
import { money } from '@/format';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import { STRATEGY_LADDER } from '@/strategies/ladder';
import type { Strategy } from '@/data/types';

export default function Strategies() {
  const router = useRouter();
  const [tab, setTab] = useState(0);
  const { data, loading, error, reload } = useAsync(() => repos.strategies.list(), []);
  const all = data ?? [];
  const live = all.filter((s) => s.state === 'live' || s.state === 'watch');
  /*
   * Paused strategies stay on this list.
   *
   * Filtering to live-only meant pausing one made it disappear, taking its Resume button with it —
   * a one-way door out of a state the user chose. The header count still says how many are
   * RUNNING, which is the number that matters; the list says what exists.
   */
  const paused = all.filter((s) => s.state === 'paused');
  const shown = [...live, ...paused];

  return (
    <Screen tabbed>
      <ScreenHeader
        left={<Text style={[type.screenTitle, { color: ink.full }]}>Strategies</Text>}
        right={<Text style={[type.footnote, { color: ink.i28 }]}>{live.length} running</Text>}
      />

      <Text style={[type.secondary, { color: ink.i40, marginTop: 10 }]}>
        What the bot is allowed to do on its own, and what it is doing right now.
      </Text>

      <Segmented
        options={['Running', 'Add new']}
        value={tab}
        onChange={setTab}
        style={{ marginTop: 18 }}
        accessibilityLabel="Strategy view"
      />

      <Screen.Content style={{ marginTop: 8 }}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {tab === 0 ? (
            loading && !data ? (
              <LoadingRows count={3} />
            ) : error ? (
              <ErrorState error={error} onRetry={reload} />
            ) : shown.length === 0 ? (
              <View style={{ gap: 16, paddingTop: 10 }}>
                <EmptyState text="Nothing running yet." />
                <Text style={[type.noteBody, { color: ink.i45, textAlign: 'center' }]}>
                  A recurring buy is the simplest thing to hand over. You set the amount and the
                  day; the bot does nothing else.
                </Text>
                <Button label="Set up a recurring buy" onPress={() => router.push('/strategy/dca')} />
              </View>
            ) : (
              shown.map((s) => <StrategyRow key={s.id} s={s} onChanged={reload} />)
            )
          ) : (
            <View style={{ gap: 12, paddingTop: 6 }}>
              {STRATEGY_LADDER.map((entry) => (
                <SheetCard key={entry.kind} radius={radius.xl} padding={16}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: surfaces.surfaceAlt,
                      }}
                    >
                      <Text style={[type.tagSm, { color: ink.i55, letterSpacing: 0 }]}>
                        {entry.tier}
                      </Text>
                    </View>
                    <Text style={[type.cardTitleSm, { color: ink.full, flex: 1 }]}>
                      {entry.label}
                    </Text>
                    {entry.available ? null : (
                      <Text style={[type.footnote, { color: ink.i28 }]}>Later</Text>
                    )}
                  </View>
                  <Text style={[type.noteBody, { color: ink.i45, marginTop: 10 }]}>
                    {entry.what}
                  </Text>
                  <Text style={[type.footnote, { color: ink.i32, marginTop: 8 }]}>
                    {entry.judgement}
                  </Text>
                  {entry.available ? (
                    <Button
                      label={entry.cta}
                      variant="secondary"
                      height={46}
                      style={{ marginTop: 14 }}
                      onPress={() => router.push(entry.route as never)}
                    />
                  ) : null}
                </SheetCard>
              ))}
            </View>
          )}
        </ScrollView>
      </Screen.Content>
    </Screen>
  );
}

/**
 * A running strategy, with the two things a user needs to be able to do to it.
 *
 * There was no way to stop one: a user could add strategies until they hit the daily cap and then
 * had no route out, which made the cap — working exactly as designed — read as the app being
 * broken. "Run now" exists because a weekly cadence is the point of the product and useless for
 * seeing that it works.
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
        // Say what happened. "Nothing to do" is a real and common outcome for a rebalance that has
        // not drifted, and it must not read as a failure.
        setNote(
          r.status === 'filled'
            ? `Filled ${r.units?.toFixed(4)} at ${money(r.price ?? 0)}`
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

  const paused = s.state === 'paused';
  return (
    <View>
      <Row
        primary={s.label}
        secondary={`${s.state === 'watch' ? 'Watching · ' : ''}Next run ${next}`}
        value={money(s.dailyAllocationUsd, { fractionDigits: 0 })}
        delta={paused ? 'Paused' : s.state === 'live' ? 'Live' : 'Watch'}
        deltaColor={paused ? ink.i40 : s.state === 'live' ? pnl.up : ink.i40}
        height={64}
      />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: -4, marginBottom: 10 }}>
        <SmallAction
          label={busy === 'run' ? 'Running…' : 'Run now'}
          disabled={busy !== undefined || paused}
          onPress={() => void act('run')}
        />
        <SmallAction
          label={busy === 'pause' ? '…' : paused ? 'Resume' : 'Pause'}
          disabled={busy !== undefined}
          onPress={() => void act('pause')}
        />
      </View>
      {note ? (
        <Text style={[type.footnote, { color: ink.i45, marginTop: -6, marginBottom: 10 }]}>
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
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => ({
        // MIN_HIT keeps the target at the 44px the design mandates even though the pill is shorter.
        minHeight: MIN_HIT,
        justifyContent: 'center',
        paddingHorizontal: 14,
        borderRadius: radius.lg2,
        backgroundColor: surfaces.control,
        opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
      })}
    >
      <Text style={[type.pill, { color: ink.full }]}>{label}</Text>
    </Pressable>
  );
}
