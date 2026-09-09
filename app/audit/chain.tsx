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
import { ScrollView } from 'react-native';
import {
  Button,
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
import { useRouter } from 'expo-router';
import { useAsync } from '@/data/useAsync';
import { system } from '@/data/system';
import { repos } from '@/data';

export default function AuditChain() {
  const goBack = useGoBack();
  const router = useRouter();
  const { data, loading, error, reload } = useAsync(() => system.auditChain(), []);
  /*
   * The rows the count above is about.
   *
   * `/audit/[seq]` had no way in — it was written and then reachable only by typing a URL, which is
   * the orphan this whole set was supposed to avoid. Listing the entries here is also the better
   * shape: a screen that says "168 entries verify" should be able to show you one.
   */
  const entries = useAsync(() => repos.activity.list(), []);

  return (
    <Screen>
      <HeaderBar onBack={goBack} title={<Text variant="screenTitle">The trail</Text>} />

      <Fill style={{ marginTop: space.s20 }}>
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : loading && !data ? (
          <Placeholder height={160} />
        ) : !data ? null : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: space.s30, gap: space.s12 }}
          >
            <SheetCard bordered borderRadius={radius.panel} padding={space.s18}>
              <Text variant="footnote" color={colors.ink40}>
                HASH CHAIN
              </Text>
              {/*
                Three headlines, not two. "Someone edited this" and "two writers raced" are
                different facts and the server distinguishes them deliberately; collapsing both to
                "Broken" would make a concurrency bug read as tampering, which is the single most
                alarming thing this screen could say wrongly.
              */}
              <Text
                variant="screenTitle"
                color={data.ok ? colors.up : data.kind === 'content' ? colors.down : colors.warn}
                style={{ marginTop: space.s6 }}
              >
                {data.ok ? 'Unbroken' : data.kind === 'content' ? 'Edited' : 'Forked'}
              </Text>
              <Text variant="secondary" color={colors.ink65} style={{ marginTop: space.s10 }}>
                {data.ok
                  ? `${data.checked} entries, each one committing to the hash of the entry before it.`
                  : data.kind === 'content'
                    ? `Entry ${data.brokenAtSeq ?? '—'} does not hash to its own contents. Something changed a record after it was written.`
                    : `Entry ${data.brokenAtSeq ?? '—'} does not point at the one before it. Two writers claimed the same predecessor — damage, not an edit.`}
              </Text>
              {/*
                `intact` is worth showing even when the chain holds: it is the count of rows whose
                CONTENTS still verify, which is a different question from whether the links line up.
              */}
              <Text variant="secondarySm" color={colors.ink40} style={{ marginTop: space.s8 }}>
                {data.intact} of {data.checked} rows still hash to their own contents.
              </Text>
            </SheetCard>

            <SheetCard bordered borderRadius={radius.panel} padding={space.s16}>
              <Text variant="secondary" color={colors.ink65}>
                {/*
                  Why there is no "repair" button, said out loud. It is the most obvious missing
                  affordance on this screen and its absence is the point.
                */}
                A broken chain cannot be repaired, only reported. Recomputing the hashes would make
                the trail verify again while proving nothing — which is exactly what an edited trail
                would want to do. A fork stays forked for the same reason: the trail is append-only,
                so there is no write that could straighten it.
              </Text>
            </SheetCard>

            {/*
              The half of the integrity claim that does not depend on trusting us.
              Everything above is our code re-hashing our rows and reporting the result, which a
              sceptic has no reason to accept. The anchor screen shows the head hash sitting in a
              Base contract at a named block, readable without our cooperation.
            */}
            <SheetCard bordered borderRadius={radius.panel} padding={space.s16}>
              <Text variant="secondary" color={colors.ink65}>
                Everything above is our own code re-checking our own rows. The head of this chain is
                also published to Base, so the same claim can be read from somewhere we do not
                control.
              </Text>
              <Button
                label="What Base holds"
                variant="ghost"
                onPress={() => router.push('/audit/anchor')}
                style={{ marginTop: space.s12 }}
              />
            </SheetCard>

            <Button
              label="The full trail"
              variant="ghost"
              onPress={() => router.push('/activity')}
            />

            {(entries.data ?? []).slice(0, 25).map((e) => (
              <Row
                key={e.id}
                height={size.rowLg}
                onPress={() => router.push(`/audit/${e.id}`)}
                title={e.action}
                secondary={`${e.agent} · ${e.t}`}
                value={
                  e.amount ? (
                    <Text variant="rowPrimary">{e.amount}</Text>
                  ) : (
                    <Text variant="footnote" color={colors.ink28}>
                      {e.kind}
                    </Text>
                  )
                }
              />
            ))}
          </ScrollView>
        )}
      </Fill>
    </Screen>
  );
}
