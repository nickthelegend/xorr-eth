/**
 * The venues the delegation may reach, and the tokens it may pull.
 *
 * This is the allowlist the contract enforces on every single route. It is why "the bot can only
 * trade" is a property and not a promise: a swap to an address that is not in this list reverts,
 * whatever the executor intended and whoever is holding its key.
 *
 * The token list is the other half and is easy to miss. The delegation spends USDC, but a swap has
 * to be able to pull the token it is selling too, so the approval set is wider than the settlement
 * token — and "wider than you would guess" is exactly the kind of fact worth showing rather than
 * summarising.
 *
 * Addresses in full. This is a list someone checks against a block explorer, and six characters of
 * a router address identifies nothing.
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
import { shortAddress } from '@/format';
import { useAsync } from '@/data/useAsync';
import { system } from '@/data/system';

export default function Venues() {
  const goBack = useGoBack();
  const { data, loading, error, reload } = useAsync(() => system.delegationParams(), []);

  const venues = data?.venues ?? [];
  const tokens = data?.tokens ?? [];

  return (
    <Screen gutter="none">
      <View style={{ paddingHorizontal: space.gutter }}>
        <HeaderBar onBack={goBack} title={<Text variant="screenTitle">Venues</Text>} />
        <Text variant="secondary" color={colors.ink40} style={{ marginTop: space.s8 }}>
          Where a fill is allowed to go. Anything not here reverts on-chain, whatever the executor
          intended.
        </Text>
      </View>

      <Fill style={{ marginTop: space.s16 }}>
        {error ? (
          <View style={{ paddingHorizontal: space.gutter }}>
            <ErrorState error={error} onRetry={reload} />
          </View>
        ) : loading && !data ? (
          <View style={{ paddingHorizontal: space.gutter }}>
            <LoadingRows count={4} height={size.row} />
          </View>
        ) : venues.length === 0 ? (
          <EmptyState text="No venues are allowlisted, so no route can settle." />
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: space.gutter,
              paddingBottom: space.s30,
              gap: space.s10,
            }}
          >
            <SheetCard bordered borderRadius={radius.panel} padding={space.s14}>
              <Text variant="footnote" color={colors.ink40}>
                CONTRACT
              </Text>
              <Text variant="rowPrimary" style={{ marginTop: space.s4 }}>
                {shortAddress(data!.contract)}
              </Text>
              <Text variant="footnote" color={colors.ink28} style={{ marginTop: space.s6 }}>
                signs as {shortAddress(data!.delegate)}
              </Text>
            </SheetCard>

            <Text variant="footnote" color={colors.ink40} style={{ marginTop: space.s10 }}>
              {venues.length === 1 ? 'ONE VENUE' : `${venues.length} VENUES`}
            </Text>
            {venues.map((v) => (
              <SheetCard key={v} bordered borderRadius={radius.panel} padding={space.s14}>
                <Text variant="footnoteSm" color={colors.ink65}>
                  {v}
                </Text>
              </SheetCard>
            ))}

            {tokens.length > 0 ? (
              <>
                <Text variant="footnote" color={colors.ink40} style={{ marginTop: space.s10 }}>
                  TOKENS IT MAY PULL
                </Text>
                {tokens.map((t) => (
                  <SheetCard key={t.address} bordered borderRadius={radius.panel} padding={space.s14}>
                    <Text variant="rowPrimary">{t.symbol}</Text>
                    <Text variant="footnoteSm" color={colors.ink28} style={{ marginTop: space.s6 }}>
                      {t.address}
                    </Text>
                  </SheetCard>
                ))}
              </>
            ) : null}
          </ScrollView>
        )}
      </Fill>
    </Screen>
  );
}
