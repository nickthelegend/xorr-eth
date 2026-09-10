/**
 * What this executor has done, counted.
 *
 * `/status` says whether the machine is up; this says what it has been doing. Runs by outcome,
 * strategies by state, alerts and what they have fired, and today's spend — the four numbers an
 * operator would actually check, and the ones that make "the scheduler trades unattended" a claim
 * with arithmetic behind it.
 *
 * Deployment-wide rather than wallet-scoped, and the screen says so. A run count that silently
 * mixed every wallet's activity into one figure and called it yours would be worse than no figure.
 */
import React from 'react';
import { ScrollView, View } from 'react-native';
import { useGoBack } from '@/nav/useGoBack';
import {
  ErrorState,
  Fill,
  HeaderBar,
  Placeholder,
  Screen,
  SheetCard,
  Text,
  colors,
  radius,
  space,
} from '@/ui';
import { money, percent } from '@/format';
import { useAsync } from '@/data/useAsync';
import { system } from '@/data/system';

/** Green for what landed, amber for what was refused, red for what broke. */
function toneFor(status: string): string {
  if (status === 'filled') return colors.up;
  if (status === 'failed') return colors.down;
  if (status === 'pending') return colors.ink40;
  return colors.warn;
}

export default function Metrics() {
  const goBack = useGoBack();
  const { data, loading, error, reload } = useAsync(() => system.metrics(), []);

  const runs = Object.entries(data?.runs ?? {}).sort((a, b) => b[1] - a[1]);
  const strategies = Object.entries(data?.strategies ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <Screen gutter="none">
      <View style={{ paddingHorizontal: space.gutter }}>
        <HeaderBar onBack={goBack} title={<Text variant="screenTitle">Metrics</Text>} />
        <Text variant="secondary" color={colors.ink40} style={{ marginTop: space.s8 }}>
          Everything this executor has done, across every wallet on it — not only yours.
        </Text>
      </View>

      <Fill style={{ marginTop: space.s16 }}>
        {error ? (
          <View style={{ paddingHorizontal: space.gutter }}>
            <ErrorState error={error} onRetry={reload} />
          </View>
        ) : loading && !data ? (
          <View style={{ paddingHorizontal: space.gutter, gap: space.s12 }}>
            <Placeholder height={110} />
            <Placeholder height={110} />
          </View>
        ) : !data ? null : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: space.gutter,
              paddingBottom: space.s30,
              gap: space.s10,
            }}
          >
            <SheetCard bordered borderRadius={radius.panel} padding={space.s16}>
              <Text variant="footnote" color={colors.ink40}>
                RUNS BY OUTCOME
              </Text>
              {runs.length === 0 ? (
                <Text variant="secondarySm" color={colors.ink40} style={{ marginTop: space.s8 }}>
                  Nothing has run yet.
                </Text>
              ) : (
                runs.map(([status, n]) => (
                  <View
                    key={status}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      marginTop: space.s10,
                    }}
                  >
                    <Text variant="secondarySm" color={toneFor(status)}>
                      {status}
                    </Text>
                    <Text variant="secondarySm">{n}</Text>
                  </View>
                ))
              )}
              {runs.length > 0 ? (
                <Text variant="footnote" color={colors.ink28} style={{ marginTop: space.s12 }}>
                  {percent(data.runFailureRate * 100, { digits: 1, explicitSign: false })} of
                  attempts broke rather than filled.
                </Text>
              ) : null}
            </SheetCard>

            <SheetCard bordered borderRadius={radius.panel} padding={space.s16}>
              <Text variant="footnote" color={colors.ink40}>
                STRATEGIES BY STATE
              </Text>
              {strategies.length === 0 ? (
                <Text variant="secondarySm" color={colors.ink40} style={{ marginTop: space.s8 }}>
                  None exist.
                </Text>
              ) : (
                strategies.map(([state, n]) => (
                  <View
                    key={state}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      marginTop: space.s10,
                    }}
                  >
                    <Text variant="secondarySm" color={colors.ink65}>
                      {state}
                    </Text>
                    <Text variant="secondarySm">{n}</Text>
                  </View>
                ))
              )}
            </SheetCard>

            {/*
              Why runs failed, not only how many. A failure rate says something is wrong and
              nothing about what; these buckets are the things an operator would act on
              differently — the market, the user, or us.
            */}
            {Object.keys(data.failuresByCause).length > 0 ? (
              <SheetCard bordered borderRadius={radius.panel} padding={space.s16}>
                <Text variant="footnote" color={colors.ink40}>
                  WHY RUNS FAILED · LAST 7 DAYS
                </Text>
                {Object.entries(data.failuresByCause)
                  .sort((a, b) => b[1] - a[1])
                  .map(([cause, n]) => (
                    <View
                      key={cause}
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        marginTop: space.s10,
                      }}
                    >
                      <Text variant="secondarySm" color={colors.ink65}>
                        {cause.replace(/_/g, ' ')}
                      </Text>
                      <Text variant="secondarySm">{n}</Text>
                    </View>
                  ))}
              </SheetCard>
            ) : null}

            {Object.keys(data.fillsByVenue).length > 0 ? (
              <SheetCard bordered borderRadius={radius.panel} padding={space.s16}>
                <Text variant="footnote" color={colors.ink40}>
                  WHERE FILLS SETTLED
                </Text>
                {/* The claim the 1inch integration rests on, counted from the audit trail. */}
                {Object.entries(data.fillsByVenue)
                  .sort((a, b) => b[1] - a[1])
                  .map(([venue, n]) => (
                    <View
                      key={venue}
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        marginTop: space.s10,
                      }}
                    >
                      <Text variant="secondarySm" color={colors.ink65}>
                        {venue}
                      </Text>
                      <Text variant="secondarySm">{n}</Text>
                    </View>
                  ))}
              </SheetCard>
            ) : null}

            {/*
              How WELL each venue filled, not just where.
              The card above counts settlements, which is a label. This is the distance between
              what the router promised and what the chain delivered — the only thing that makes
              "Aqua filled this" a claim about routing rather than a note about it.
            */}
            {data.fillQuality && data.fillQuality.venues.length > 0 ? (
              <SheetCard bordered borderRadius={radius.panel} padding={space.s16}>
                <Text variant="footnote" color={colors.ink40}>
                  HOW CLOSE TO THE QUOTE
                </Text>
                {data.fillQuality.venues.map((v) => (
                  <View key={v.venue} style={{ marginTop: space.s10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text variant="secondarySm" color={colors.ink65}>
                        {`${v.venue} · ${v.fills} fill${v.fills === 1 ? '' : 's'}`}
                      </Text>
                      {/* Positive beat the quote. The sign is the fact, so it is always shown. */}
                      <Text variant="secondarySm" color={v.meanBps >= 0 ? colors.up : colors.down}>
                        {`${v.meanBps >= 0 ? '+' : ''}${v.meanBps} bps`}
                      </Text>
                    </View>
                    {v.fills > 1 ? (
                      <Text variant="footnote" color={colors.ink28}>
                        {`worst ${v.worstBps} · best ${v.bestBps >= 0 ? '+' : ''}${v.bestBps}`}
                      </Text>
                    ) : null}
                  </View>
                ))}
                <Text variant="footnote" color={colors.ink28} style={{ marginTop: space.s12 }}>
                  {data.fillQuality.basis === 'forked'
                    ? `${data.fillQuality.measured} measured, ${data.fillQuality.unmeasurable} without a stored quote. On a fork the reference quote prices live mainnet while the fill runs against a pinned block, so this carries drift as well as venue quality.`
                    : `${data.fillQuality.measured} measured, ${data.fillQuality.unmeasurable} without a stored quote.`}
                </Text>
              </SheetCard>
            ) : null}

            <SheetCard bordered borderRadius={radius.panel} padding={space.s16}>
              <Text variant="footnote" color={colors.ink40}>
                ALERTS
              </Text>
              <Text variant="rowPrimary" style={{ marginTop: space.s6 }}>
                {data.alertsEnabled} enabled · {data.alertsFiredTotal} fired
              </Text>
            </SheetCard>

            <SheetCard bordered borderRadius={radius.panel} padding={space.s16}>
              <Text variant="footnote" color={colors.ink40}>
                SPENT TODAY
              </Text>
              <Text variant="rowPrimary" style={{ marginTop: space.s6 }}>
                {money(data.spentTodayUsd)}
              </Text>
              <Text variant="footnote" color={colors.ink28} style={{ marginTop: space.s6 }}>
                UTC day, every wallet on this executor.
              </Text>
            </SheetCard>
          </ScrollView>
        )}
      </Fill>
    </Screen>
  );
}
