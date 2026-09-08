/**
 * Every claim this product makes, checked against the running system, on demand.
 *
 * The executor has had `/verify` since early on: twenty checks that each name a claim, the exact
 * call they make to test it, and what came back. It was reachable with curl and from nowhere in the
 * app — which is a strange place to leave the one endpoint that answers "is any of this real".
 *
 * The screen shows `how` and `observed` for every row, not just a tick. A green tick is a claim
 * about a claim; "eth_getCode 0xabe6… → 3926 bytes" is something a reader can go and check
 * themselves, which is the only kind of verification worth putting on screen.
 *
 * `skip` is rendered as its own state, deliberately. Most checks need a wallet on the request, so
 * an anonymous report skips a third of them — painting those red would put a wall of failure in
 * front of someone whose setup is fine.
 */
import React from 'react';
import { ScrollView, View } from 'react-native';
import { useGoBack } from '@/nav/useGoBack';
import {
  EmptyState,
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
import { system, type VerifyCheck } from '@/data/system';

const DOT = 8;

/** Green passes, red fails, and grey is "not asked" — three states, because there are three. */
function toneFor(status: VerifyCheck['status']): string {
  if (status === 'pass') return colors.up;
  if (status === 'fail') return colors.down;
  return colors.ink30;
}

export default function Verify() {
  const goBack = useGoBack();
  const { data, loading, error, reload } = useAsync(() => system.verifyReport(), []);

  return (
    <Screen gutter="none">
      <View style={{ paddingHorizontal: space.gutter }}>
        <HeaderBar onBack={goBack} title={<Text variant="screenTitle">Verification</Text>} />
        <Text variant="secondary" color={colors.ink40} style={{ marginTop: space.s8 }}>
          Each row is a claim, the call that tests it, and what came back. Run against whatever this
          build is actually pointed at.
        </Text>
      </View>

      <Fill style={{ marginTop: space.s16 }}>
        {error ? (
          <View style={{ paddingHorizontal: space.gutter }}>
            <ErrorState error={error} onRetry={reload} />
          </View>
        ) : loading && !data ? (
          <View style={{ paddingHorizontal: space.gutter }}>
            <LoadingRows count={7} height={size.rowLg} />
          </View>
        ) : !data || data.checks.length === 0 ? (
          <EmptyState text="The report came back with nothing in it." />
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: space.gutter,
              paddingBottom: space.s30,
              gap: space.s10,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                gap: space.s16,
                paddingBottom: space.s12,
              }}
            >
              <Tally label="Passed" value={data.passed} tone={colors.up} />
              <Tally label="Failed" value={data.failed} tone={data.failed > 0 ? colors.down : colors.ink40} />
              <Tally label="Not asked" value={data.skipped} tone={colors.ink40} />
            </View>

            <Text variant="footnote" color={colors.ink28}>
              {data.chain} · {new Date(data.at).toLocaleString('en-US')}
            </Text>

            {data.checks.map((c) => (
              <SheetCard key={c.id} bordered borderRadius={radius.panel} padding={space.s14}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.s10 }}>
                  <View
                    style={{
                      width: DOT,
                      height: DOT,
                      borderRadius: DOT / 2,
                      backgroundColor: toneFor(c.status),
                      marginTop: space.s6,
                    }}
                  />
                  <View style={{ flex: 1, gap: space.s6 }}>
                    <Text variant="rowPrimary">{c.claim}</Text>
                    {/*
                      The call, then the result. Monospace-ish framing matters less than the fact
                      that both are here: a claim with only a verdict is an assertion, and a claim
                      with the method and the observation is a receipt.
                    */}
                    <Text variant="footnote" color={colors.ink40}>
                      {c.how}
                    </Text>
                    <Text
                      variant="secondarySm"
                      color={c.status === 'skip' ? colors.ink35 : colors.ink65}
                    >
                      {c.observed}
                    </Text>
                  </View>
                </View>
              </SheetCard>
            ))}
          </ScrollView>
        )}
      </Fill>
    </Screen>
  );
}

function Tally({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <View style={{ gap: space.s2 }}>
      <Text variant="screenTitle" color={tone}>
        {String(value)}
      </Text>
      <Text variant="footnote" color={colors.ink40}>
        {label}
      </Text>
    </View>
  );
}
