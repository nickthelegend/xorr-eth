/**
 * The API keys that can drive this account without a person.
 *
 * The agent surface is a real, scoped API: a key with `trade:open` can place orders, and one with
 * `admin` can mint more keys. That existed with no way to see what had been issued — which is the
 * one thing you need to see, because a key you have forgotten about is indistinguishable from a
 * key someone else is holding.
 *
 * Scopes are listed per key rather than summarised. "Full access" and "read plus close" are
 * different risks and a single word for both is how an over-scoped key survives a review.
 *
 * There is no way to reveal a key here, because the server stores only a digest. That is a feature
 * and the screen says so rather than leaving a reader to wonder where the button went.
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
import { system, type AgentKey } from '@/data/system';

/** `admin` and `trade:*` are the ones worth a second look; `read` is not. */
function scopeTone(scope: string): string {
  if (scope === 'admin') return colors.down;
  if (scope.startsWith('trade')) return colors.warn;
  return colors.ink40;
}

export default function Keys() {
  const goBack = useGoBack();
  const { data, loading, error, reload } = useAsync(() => system.agentKeys(), []);

  const keys = data ?? [];
  const live = keys.filter((k) => !k.revoked);

  return (
    <Screen gutter="none">
      <View style={{ paddingHorizontal: space.gutter }}>
        <HeaderBar onBack={goBack} title={<Text variant="screenTitle">API keys</Text>} />
        <Text variant="secondary" color={colors.ink40} style={{ marginTop: space.s8 }}>
          Keys that can act on this account without a person present.
        </Text>
      </View>

      <Fill style={{ marginTop: space.s16 }}>
        {error ? (
          <View style={{ paddingHorizontal: space.gutter }}>
            <ErrorState error={error} onRetry={reload} />
          </View>
        ) : loading && !data ? (
          <View style={{ paddingHorizontal: space.gutter }}>
            <LoadingRows count={3} height={size.row} />
          </View>
        ) : keys.length === 0 ? (
          <EmptyState text="No keys have been issued. Nothing can drive this account except you." />
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: space.gutter,
              paddingBottom: space.s30,
              gap: space.s10,
            }}
          >
            <Text variant="footnote" color={colors.ink28}>
              {live.length} live · {keys.length - live.length} revoked
            </Text>
            {keys.map((k) => (
              <KeyRow key={k.id} agentKey={k} />
            ))}
            <SheetCard bordered borderRadius={radius.panel} padding={space.s14}>
              <Text variant="secondarySm" color={colors.ink40}>
                {/*
                  The missing button, explained. Someone will look for it.
                */}
                A key is shown once, when it is created. The server keeps only its digest, so there
                is no route that can show it again — which is the property that makes storing a
                digest worth anything.
              </Text>
            </SheetCard>
          </ScrollView>
        )}
      </Fill>
    </Screen>
  );
}

function KeyRow({ agentKey }: { agentKey: AgentKey }) {
  return (
    <SheetCard bordered borderRadius={radius.panel} padding={space.s14}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text variant="rowPrimary" color={agentKey.revoked ? colors.ink40 : colors.ink}>
          {agentKey.name}
        </Text>
        {agentKey.revoked ? (
          <Text variant="control" color={colors.ink35}>
            Revoked
          </Text>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s8, marginTop: space.s10 }}>
        {agentKey.scopes.map((s) => (
          <Text key={s} variant="footnote" color={agentKey.revoked ? colors.ink28 : scopeTone(s)}>
            {s}
          </Text>
        ))}
      </View>

      {/*
        "Never used" is a real and useful state: a live key that has never been seen is either
        spare or leaked, and either way it is the one to revoke first.
      */}
      <Text variant="footnote" color={colors.ink28} style={{ marginTop: space.s8 }}>
        {agentKey.lastSeenAt
          ? `Last used ${new Date(agentKey.lastSeenAt).toLocaleString('en-US')}`
          : 'Never used'}
      </Text>
    </SheetCard>
  );
}
