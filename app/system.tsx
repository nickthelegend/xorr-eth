/**
 * The executor and everything it needs to work.
 *
 * At `/system`, not `/status`. Expo's dev server answers `/status` itself with a plain-text
 * `packager-status:running`, so the route never reached the app router and the screen was
 * unreachable in development — an easy thing to miss, because the URL loads and returns 200.
 * Colliding with a well-known dev-server path is a trap worth designing out rather than working
 * around.
 *
 * `/health` names each dependency, whether it answered, how long it took and — importantly —
 * whether it is critical. That last field is why this is a screen rather than a green dot: gas
 * being low is not the same kind of fact as Postgres being down, and a single "healthy" badge
 * flattens the two into one word that is wrong half the time.
 *
 * Latency is shown per dependency. A database that answers in 400ms is not down, and it is also
 * not fine, and there is no other place in the app that would ever tell you.
 */
import React from 'react';
import { ScrollView, View } from 'react-native';
import { useGoBack } from '@/nav/useGoBack';
import {
  ErrorState,
  Fill,
  HeaderBar,
  LoadingRows,
  Screen,
  SheetCard,
  Text,
  colors,
  radius,
  size,
  space,
} from '@/ui';
import { useAsync } from '@/data/useAsync';
import { system, type HealthDependency } from '@/data/system';
import { shortAddress } from '@/format';

const DOT = 8;

function toneFor(status: string): string {
  if (status === 'up') return colors.up;
  if (status === 'down') return colors.down;
  return colors.warn;
}

/** Seconds into something a person reads without converting. */
function uptime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86_400)}d`;
}

export default function Status() {
  const goBack = useGoBack();
  const { data, loading, error, reload } = useAsync(() => system.health(), []);

  const deps = data?.dependencies ?? [];
  const criticalDown = deps.filter((d) => d.critical && d.status !== 'up').length;

  return (
    <Screen gutter="none">
      <View style={{ paddingHorizontal: space.gutter }}>
        <HeaderBar onBack={goBack} title={<Text variant="screenTitle">System</Text>} />
      </View>

      <Fill style={{ marginTop: space.s16 }}>
        {error ? (
          <View style={{ paddingHorizontal: space.gutter }}>
            <ErrorState error={error} onRetry={reload} />
          </View>
        ) : loading && !data ? (
          <View style={{ paddingHorizontal: space.gutter }}>
            <LoadingRows count={5} height={size.row} />
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
            <SheetCard bordered borderRadius={radius.panel} padding={space.s18}>
              <Text variant="footnote" color={colors.ink40}>
                EXECUTOR
              </Text>
              <Text
                variant="screenTitle"
                color={criticalDown > 0 ? colors.down : colors.up}
                style={{ marginTop: space.s6 }}
              >
                {criticalDown > 0 ? 'Degraded' : 'Up'}
              </Text>
              <Text variant="secondarySm" color={colors.ink40} style={{ marginTop: space.s8 }}>
                {data.chain} · up {uptime(data.uptimeSec)}
              </Text>
              <Text variant="footnote" color={colors.ink28} style={{ marginTop: space.s4 }}>
                {shortAddress(data.delegation)}
              </Text>
            </SheetCard>

            {deps.map((d) => (
              <DependencyRow key={d.name} dep={d} />
            ))}
          </ScrollView>
        )}
      </Fill>
    </Screen>
  );
}

function DependencyRow({ dep }: { dep: HealthDependency }) {
  return (
    <SheetCard bordered borderRadius={radius.panel} padding={space.s14}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s10 }}>
        <View
          style={{
            width: DOT,
            height: DOT,
            borderRadius: DOT / 2,
            backgroundColor: toneFor(dep.status),
          }}
        />
        <Text variant="rowPrimary" style={{ flex: 1 }}>
          {dep.name}
        </Text>
        {/*
          Critical is worth saying out loud. "gas: low" and "postgres: down" are both amber-ish
          words and only one of them stops the product working.
        */}
        {dep.critical ? null : (
          <Text variant="footnote" color={colors.ink28}>
            not critical
          </Text>
        )}
        {dep.ms === undefined ? null : (
          <Text variant="footnote" color={dep.ms > 500 ? colors.warn : colors.ink40}>
            {dep.ms}ms
          </Text>
        )}
      </View>
      {dep.detail ? (
        <Text variant="secondarySm" color={colors.ink40} style={{ marginTop: space.s8 }}>
          {dep.detail}
        </Text>
      ) : null}
    </SheetCard>
  );
}
