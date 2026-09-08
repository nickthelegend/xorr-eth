/**
 * One strategy: what it is set to do, and what it has actually done.
 *
 * The strategies tab lists them and the creators make them; nothing showed a live one in full.
 * Parameters and outcomes on one screen is the point — a DCA set to buy fifty dollars weekly that
 * has filled twice and been refused nine times is a different object from the same DCA with nine
 * fills, and the list row is identical for both.
 *
 * Runs are filtered to this strategy, which the list screen cannot do.
 */
import React, { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useGoBack } from '@/nav/useGoBack';
import {
  ErrorState,
  Fill,
  HeaderBar,
  Placeholder,
  Row,
  Screen,
  SheetCard,
  Text,
  colors,
  radius,
  size,
  space,
} from '@/ui';
import { money, quantity } from '@/format';
import { useAsync } from '@/data/useAsync';
import { repos } from '@/data';
import { system, type StrategyRunRow } from '@/data/system';

function toneFor(status: StrategyRunRow['status']): string {
  if (status === 'filled') return colors.up;
  if (status === 'failed') return colors.down;
  if (status === 'pending') return colors.ink40;
  return colors.warn;
}

export default function StrategyDetail() {
  const goBack = useGoBack();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const strategies = useAsync(() => repos.strategies.list(), []);
  const runs = useAsync(() => system.runs(200), []);

  const strategy = (strategies.data ?? []).find((s) => s.id === id);
  const mine = useMemo(
    () => (runs.data ?? []).filter((r) => r.strategyId === id),
    [runs.data, id],
  );

  const filled = mine.filter((r) => r.status === 'filled');
  const spent = filled.reduce((sum, r) => sum + (r.usd ?? 0), 0);

  return (
    <Screen gutter="none">
      <View style={{ paddingHorizontal: space.gutter }}>
        <HeaderBar onBack={goBack} title={<Text variant="screenTitle">Strategy</Text>} />
      </View>

      <Fill style={{ marginTop: space.s16, paddingHorizontal: space.gutter }}>
        {strategies.error ? (
          <ErrorState error={strategies.error} onRetry={strategies.reload} />
        ) : strategies.loading && !strategies.data ? (
          <Placeholder height={160} />
        ) : !strategy ? (
          <Text variant="body" color={colors.ink40}>
            No strategy with that id.
          </Text>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: space.s30, gap: space.s10 }}
          >
            <SheetCard bordered borderRadius={radius.panel} padding={space.s18}>
              <Text variant="footnote" color={colors.ink40}>
                {strategy.kind.toUpperCase()} · {strategy.state.toUpperCase()}
              </Text>
              <Text variant="screenTitle" style={{ marginTop: space.s6 }}>
                {strategy.label}
              </Text>
              <Text variant="secondarySm" color={colors.ink40} style={{ marginTop: space.s8 }}>
                {strategy.symbol}
              </Text>
            </SheetCard>

            <SheetCard bordered borderRadius={radius.panel} padding={space.s16}>
              <Text variant="footnote" color={colors.ink40}>
                SET TO
              </Text>
              {/*
                The parameters as stored, key by key. A strategy's params are kind-specific — a grid
                has rungs, a DCA has a cadence — and a layout written for one would drop the other's
                fields silently.
              */}
              {Object.entries(strategy.params).map(([k, v]) => (
                <View
                  key={k}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    marginTop: space.s10,
                  }}
                >
                  <Text variant="secondarySm" color={colors.ink65}>
                    {k}
                  </Text>
                  <Text variant="secondarySm">{String(v)}</Text>
                </View>
              ))}
            </SheetCard>

            <SheetCard bordered borderRadius={radius.panel} padding={space.s16}>
              <Text variant="footnote" color={colors.ink40}>
                HAS DONE
              </Text>
              <Text variant="rowPrimary" style={{ marginTop: space.s6 }}>
                {filled.length} filled · {mine.length - filled.length} did not
              </Text>
              <Text variant="secondarySm" color={colors.ink40} style={{ marginTop: space.s8 }}>
                {money(spent)} spent across its fills.
              </Text>
            </SheetCard>

            {mine.slice(0, 20).map((r) => (
              <Row
                key={r.id}
                height={size.rowLg}
                onPress={() => router.push(`/runs/${r.id}`)}
                title={new Date(r.at).toLocaleDateString('en-US')}
                secondary={r.error ?? new Date(r.at).toLocaleTimeString('en-US')}
                value={
                  <Text variant="rowPrimary" color={toneFor(r.status)}>
                    {r.status === 'filled' && r.units !== null ? quantity(r.units) : r.status}
                  </Text>
                }
              />
            ))}
          </ScrollView>
        )}
      </Fill>
    </Screen>
  );
}
