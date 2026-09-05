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
import { ScrollView, Text, View } from 'react-native';
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
import { radius } from '@/design/space';
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
  const live = (data ?? []).filter((s) => s.state === 'live' || s.state === 'watch');

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
            ) : live.length === 0 ? (
              <View style={{ gap: 16, paddingTop: 10 }}>
                <EmptyState text="Nothing running yet." />
                <Text style={[type.noteBody, { color: ink.i45, textAlign: 'center' }]}>
                  A recurring buy is the simplest thing to hand over. You set the amount and the
                  day; the bot does nothing else.
                </Text>
                <Button label="Set up a recurring buy" onPress={() => router.push('/strategy/dca')} />
              </View>
            ) : (
              live.map((s) => <StrategyRow key={s.id} s={s} />)
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

function StrategyRow({ s }: { s: Strategy }) {
  const next = s.nextRunAt
    ? new Date(s.nextRunAt).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : '—';
  return (
    <Row
      primary={s.label}
      secondary={`${s.state === 'watch' ? 'Watching · ' : ''}Next run ${next}`}
      value={money(s.dailyAllocationUsd, { fractionDigits: 0 })}
      delta={s.state === 'live' ? 'Live' : 'Watch'}
      deltaColor={s.state === 'live' ? pnl.up : ink.i40}
      height={64}
    />
  );
}
