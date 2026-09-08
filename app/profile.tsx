/**
 * This wallet: what it is called, what it has done, and where to check.
 *
 * The address appears in Settings truncated to four characters either side, which is enough to
 * recognise and not enough to verify — and two addresses that differ only in the middle look
 * identical that way. Here it is in full, with its Basename when it has one, because this is the
 * screen someone opens in order to compare it against something else.
 *
 * The counts come from the audit trail rather than a stored total. A number kept alongside the
 * events it counts is a number that can drift from them; counting the rows cannot.
 */
import React, { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
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
import { useAsync } from '@/data/useAsync';
import { repos } from '@/data';
import { system } from '@/data/system';

export default function Profile() {
  const goBack = useGoBack();
  const router = useRouter();
  const wallet = useAsync(() => repos.wallet.current(), []);
  const activity = useAsync(() => repos.activity.list(), []);

  const address = wallet.data?.address;
  /*
   * Only once there is an address to resolve. `useAsync` with a null query would either fire a
   * request for `undefined` or need a guard inside every consumer; keying on the address makes the
   * dependency explicit and the request happen exactly once.
   */
  const name = useAsync(
    async () => (address ? (await system.basenameOf(address)).name : null),
    [address],
  );

  const counts = useMemo(() => {
    const rows = activity.data ?? [];
    const by: Record<string, number> = {};
    for (const r of rows) by[r.kind] = (by[r.kind] ?? 0) + 1;
    return Object.entries(by).sort((a, b) => b[1] - a[1]);
  }, [activity.data]);

  return (
    <Screen gutter="none">
      <View style={{ paddingHorizontal: space.gutter }}>
        <HeaderBar onBack={goBack} title={<Text variant="screenTitle">This wallet</Text>} />
      </View>

      <Fill style={{ marginTop: space.s16 }}>
        {wallet.error ? (
          <View style={{ paddingHorizontal: space.gutter }}>
            <ErrorState error={wallet.error} onRetry={wallet.reload} />
          </View>
        ) : wallet.loading && !wallet.data ? (
          <View style={{ paddingHorizontal: space.gutter }}>
            <Placeholder height={150} />
          </View>
        ) : !wallet.data ? (
          <View style={{ paddingHorizontal: space.gutter }}>
            <Text variant="body" color={colors.ink40}>
              No wallet on this session.
            </Text>
          </View>
        ) : (
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
                {name.data ? 'BASENAME' : 'ADDRESS'}
              </Text>
              <Text variant="screenTitle" style={{ marginTop: space.s6 }}>
                {name.data ?? 'No name'}
              </Text>
              {/*
                In full, wrapped. Truncation is for a list; this is the screen where someone checks
                the address character by character against something else.
              */}
              <Text variant="footnoteSm" color={colors.ink40} style={{ marginTop: space.s12 }}>
                {wallet.data.address}
              </Text>
              <Text variant="footnote" color={colors.ink28} style={{ marginTop: space.s8 }}>
                {wallet.data.kind === 'embedded' ? 'Embedded wallet' : 'Connected wallet'}
              </Text>
            </SheetCard>

            {counts.length > 0 ? (
              <SheetCard bordered borderRadius={radius.panel} padding={space.s14}>
                <Text variant="footnote" color={colors.ink40}>
                  ON THE RECORD
                </Text>
                {counts.map(([kind, n]) => (
                  <View
                    key={kind}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      marginTop: space.s10,
                    }}
                  >
                    <Text variant="secondarySm" color={colors.ink65}>
                      {kind}
                    </Text>
                    <Text variant="secondarySm">{n}</Text>
                  </View>
                ))}
              </SheetCard>
            ) : null}

            <Button label="Permission" variant="ghost" onPress={() => router.push('/delegation')} />
            <Button label="Approvals" variant="ghost" onPress={() => router.push('/approvals')} />
          </ScrollView>
        )}
      </Fill>
    </Screen>
  );
}
