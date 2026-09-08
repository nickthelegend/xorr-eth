/**
 * What the delegation is allowed to pull, per token, read from the chain.
 *
 * This is the single most consequential number in the product and it had no screen. An ERC-20
 * allowance is what actually lets the contract move money: the daily cap, the venue allowlist and
 * the expiry are all enforced on top of it, but none of them exist if the allowance is zero, and
 * none of them constrain the *token* if the allowance is unlimited and something else gets the
 * spender key.
 *
 * Both forms of the number are shown. `display` is what a person reads; the raw uint256 is what the
 * chain holds and what a reader would compare against an explorer, and rounding it away would make
 * this screen unverifiable in exactly the way the rest of the app refuses to be.
 *
 * "Unlimited" is called unlimited rather than shown as 115792089237316195423570985008687907853…
 * The number is not information; the fact that it is the maximum is.
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
import { system, type TokenApproval } from '@/data/system';
import { shortAddress } from '@/format';

export default function Approvals() {
  const goBack = useGoBack();
  const { data, loading, error, reload } = useAsync(() => system.approvals(), []);

  const tokens = data?.tokens ?? [];
  const unlimited = tokens.filter((t) => t.unlimited).length;

  return (
    <Screen gutter="none">
      <View style={{ paddingHorizontal: space.gutter }}>
        <HeaderBar onBack={goBack} title={<Text variant="screenTitle">Approvals</Text>} />
        <Text variant="secondary" color={colors.ink40} style={{ marginTop: space.s8 }}>
          What the delegation contract may take from this wallet, token by token, read from the
          chain rather than from our record of it.
        </Text>
      </View>

      <Fill style={{ marginTop: space.s16 }}>
        {error ? (
          <View style={{ paddingHorizontal: space.gutter }}>
            <ErrorState error={error} onRetry={reload} />
          </View>
        ) : loading && !data ? (
          <View style={{ paddingHorizontal: space.gutter }}>
            <LoadingRows count={5} height={size.rowLg} />
          </View>
        ) : tokens.length === 0 ? (
          <EmptyState text="No approvable tokens on this chain." />
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
                Spender
              </Text>
              <Text variant="rowPrimary" style={{ marginTop: space.s4 }}>
                {shortAddress(data!.spender)}
              </Text>
              {/*
                Counted rather than asserted. "You have three unlimited approvals" is a fact this
                screen can check; "your approvals are safe" is not.
              */}
              <Text variant="secondarySm" color={unlimited > 0 ? colors.warn : colors.ink40} style={{ marginTop: space.s8 }}>
                {unlimited === 0
                  ? 'No unlimited approvals.'
                  : unlimited === 1
                    ? 'One token is approved without a limit.'
                    : `${unlimited} tokens are approved without a limit.`}
              </Text>
            </SheetCard>

            {tokens.map((t) => (
              <ApprovalRow key={t.address} token={t} />
            ))}
          </ScrollView>
        )}
      </Fill>
    </Screen>
  );
}

function ApprovalRow({ token }: { token: TokenApproval }) {
  const tone = token.none ? colors.ink40 : token.unlimited ? colors.warn : colors.up;
  const state = token.none ? 'None' : token.unlimited ? 'Unlimited' : 'Limited';

  return (
    <SheetCard bordered borderRadius={radius.panel} padding={space.s14}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text variant="rowPrimary">{token.symbol}</Text>
        <Text variant="control" color={tone}>
          {state}
        </Text>
      </View>
      <Text variant="footnote" color={colors.ink35} style={{ marginTop: space.s4 }}>
        {shortAddress(token.address)}
      </Text>
      {token.none || token.unlimited ? null : (
        <Text variant="secondarySm" color={colors.ink65} style={{ marginTop: space.s8 }}>
          {token.display} {token.symbol}
        </Text>
      )}
      {/*
        The raw value, for the reader who wants to check it against an explorer. Wrapped rather
        than truncated: a uint256 with an ellipsis in the middle cannot be compared to anything.
      */}
      {token.none ? null : (
        <Text variant="footnoteSm" color={colors.ink28} style={{ marginTop: space.s6 }}>
          {token.allowance}
        </Text>
      )}
    </SheetCard>
  );
}
