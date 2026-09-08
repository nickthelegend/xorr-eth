/**
 * Whether the audit trail has been edited.
 *
 * Every row in `audit_log` carries the hash of the row before it, so changing any past entry breaks
 * every hash after it. That property is the whole reason the trail is worth anything, and until now
 * the only way to test it was to curl `/activity/verify`.
 *
 * The screen states the result and the count it was computed over. A green tick with no number
 * behind it would be the same unfalsifiable reassurance this app exists to argue against — "we
 * checked" means nothing without "we checked these".
 *
 * A break is reported with the sequence number where it happens, and is explicitly NOT offered a
 * repair. A chain you can mend is a chain that proves nothing.
 */
import React from 'react';
import { useGoBack } from '@/nav/useGoBack';
import {
  Button,
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
import { useRouter } from 'expo-router';
import { useAsync } from '@/data/useAsync';
import { system } from '@/data/system';

export default function AuditChain() {
  const goBack = useGoBack();
  const router = useRouter();
  const { data, loading, error, reload } = useAsync(() => system.auditChain(), []);

  return (
    <Screen>
      <HeaderBar onBack={goBack} title={<Text variant="screenTitle">The trail</Text>} />

      <Fill style={{ marginTop: space.s20, gap: space.s12 }}>
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : loading && !data ? (
          <Placeholder height={160} />
        ) : !data ? null : (
          <>
            <SheetCard bordered borderRadius={radius.panel} padding={space.s18}>
              <Text variant="footnote" color={colors.ink40}>
                HASH CHAIN
              </Text>
              <Text
                variant="screenTitle"
                color={data.ok ? colors.up : colors.down}
                style={{ marginTop: space.s6 }}
              >
                {data.ok ? 'Unbroken' : 'Broken'}
              </Text>
              <Text variant="secondary" color={colors.ink65} style={{ marginTop: space.s10 }}>
                {data.ok
                  ? `${data.entries} entries, each one committing to the hash of the entry before it.`
                  : `The chain breaks at entry ${data.brokenAt ?? '—'}. Everything after it is no longer proof of anything.`}
              </Text>
              {data.detail ? (
                <Text variant="secondarySm" color={colors.ink40} style={{ marginTop: space.s8 }}>
                  {data.detail}
                </Text>
              ) : null}
            </SheetCard>

            <SheetCard bordered borderRadius={radius.panel} padding={space.s16}>
              <Text variant="secondary" color={colors.ink65}>
                {/*
                  Why there is no "repair" button, said out loud. It is the most obvious missing
                  affordance on this screen and its absence is the point.
                */}
                A broken chain cannot be repaired, only reported. Recomputing the hashes would make
                the trail verify again while proving nothing — which is exactly what an edited trail
                would want to do.
              </Text>
            </SheetCard>

            <Button
              label="Read the entries"
              variant="ghost"
              onPress={() => router.push('/activity')}
            />
          </>
        )}
      </Fill>
    </Screen>
  );
}
