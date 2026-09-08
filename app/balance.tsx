/**
 * Where the money is, split by what it is doing.
 *
 * Home shows one total. This is the split the total is made of: cash that can be spent today,
 * holdings marked at the live route, and whatever is supplied to Aave earning a rate. They behave
 * completely differently — one is spendable now, one moves with the market, one has to be withdrawn
 * first — and a single figure erases all three distinctions.
 *
 * The bar is proportional and drawn from the same numbers as the rows beneath it, so it cannot
 * disagree with them.
 */
import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useGoBack } from '@/nav/useGoBack';
import {
  Button,
  ErrorState,
  Fill,
  HeaderBar,
  Placeholder,
  Price,
  Screen,
  SheetCard,
  Text,
  colors,
  percent as pct,
  radius,
  space,
} from '@/ui';
import { money } from '@/format';
import { useAsync } from '@/data/useAsync';
import { repos } from '@/data';

const BAR_H = 8;

export default function Balance() {
  const goBack = useGoBack();
  const router = useRouter();
  const { data, loading, error, reload } = useAsync(() => repos.portfolio.balance(), []);

  const total = data?.total ?? 0;
  const held = data ? Math.max(0, data.total - data.cash - data.supplied) : 0;
  const share = (n: number) => (total > 0 ? n / total : 0);

  return (
    <Screen>
      <HeaderBar onBack={goBack} title={<Text variant="screenTitle">Balance</Text>} />

      <Fill style={{ marginTop: space.s20, gap: space.s12 }}>
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : loading && !data ? (
          <Placeholder height={160} />
        ) : !data ? (
          <Text variant="body" color={colors.ink40}>
            The balance could not be read from the chain.
          </Text>
        ) : (
          <>
            <SheetCard bordered borderRadius={radius.panel} padding={space.s18}>
              <Text variant="footnote" color={colors.ink40}>
                TOTAL
              </Text>
              <Price variant="screenTitle" style={{ marginTop: space.s6 }}>
                {money(data.total)}
              </Price>

              {/* One bar, three segments, in the order money moves: spendable, at risk, earning. */}
              <View
                style={{
                  flexDirection: 'row',
                  height: BAR_H,
                  borderRadius: BAR_H / 2,
                  backgroundColor: colors.control,
                  marginTop: space.s16,
                  overflow: 'hidden',
                }}
              >
                <View style={{ width: `${share(data.cash) * 100}%`, backgroundColor: colors.ink }} />
                <View style={{ width: `${share(held) * 100}%`, backgroundColor: colors.ink55 }} />
                <View
                  style={{ width: `${share(data.supplied) * 100}%`, backgroundColor: colors.ink30 }}
                />
              </View>
            </SheetCard>

            <Slice
              label="Cash"
              note="Spendable today. This is what the cap draws from."
              usd={data.cash}
              share={share(data.cash)}
            />
            <Slice
              label="Held"
              note="Marked at the price a sale would actually get, not a feed."
              usd={held}
              share={share(held)}
            />
            <Slice
              label="Supplied"
              note="Earning at Aave. Withdraw before it can be spent."
              usd={data.supplied}
              share={share(data.supplied)}
            />

            <Button label="Where it sits" variant="ghost" onPress={() => router.push('/allocation')} />
          </>
        )}
      </Fill>
    </Screen>
  );
}

function Slice({
  label,
  note,
  usd,
  share,
}: {
  label: string;
  note: string;
  usd: number;
  share: number;
}) {
  return (
    <SheetCard bordered borderRadius={radius.panel} padding={space.s14}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text variant="rowPrimary">{label}</Text>
        <Price variant="rowPrimary">{money(usd)}</Price>
      </View>
      <Text variant="footnote" color={colors.ink28} style={{ marginTop: space.s4 }}>
        {pct(share * 100)}
      </Text>
      <Text variant="secondarySm" color={colors.ink40} style={{ marginTop: space.s8 }}>
        {note}
      </Text>
    </SheetCard>
  );
}
