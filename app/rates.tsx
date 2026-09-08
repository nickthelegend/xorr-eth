/**
 * What idle cash earns, and where the number comes from.
 *
 * The yield screen offers the action. This is the rate itself: read as `currentLiquidityRate` from
 * the Aave v3 pool on Base, which is a floating number that changes with utilisation and is not a
 * promise. The distinction matters because a rate presented as a product feature reads as a
 * guarantee, and this one is neither ours to set nor stable.
 *
 * `feed` is rendered. A simulated rate and a live one must never look the same, and on a chain
 * where the pool is not deployed the honest answer is that there is no rate here.
 */
import React from 'react';
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
import { money, percent } from '@/format';
import { useAsync } from '@/data/useAsync';
import { repos } from '@/data';

export default function Rates() {
  const goBack = useGoBack();
  const router = useRouter();
  const rate = useAsync(() => repos.yield.staking(), []);
  const balance = useAsync(() => repos.portfolio.balance(), []);

  const apy = rate.data?.estimatedApy ?? null;
  const cash = balance.data?.cash ?? 0;
  const supplied = balance.data?.supplied ?? 0;

  return (
    <Screen>
      <HeaderBar onBack={goBack} title={<Text variant="screenTitle">Rate</Text>} />

      <Fill style={{ marginTop: space.s20, gap: space.s12 }}>
        {rate.error ? (
          <ErrorState error={rate.error} onRetry={rate.reload} />
        ) : rate.loading && !rate.data ? (
          <Placeholder height={150} />
        ) : !rate.data || apy === null ? (
          <Text variant="body" color={colors.ink40}>
            No lending pool on this chain, so there is no rate to read.
          </Text>
        ) : (
          <>
            <SheetCard bordered borderRadius={radius.panel} padding={space.s18}>
              <Text variant="footnote" color={colors.ink40}>
                USDC AT AAVE
              </Text>
              {/*
                `estimatedApy` is a FRACTION, not percentage points — 0.0412 is 4.12%. Getting that
                wrong by a factor of a hundred is the classic bug on a screen like this.
              */}
              <Text variant="screenTitle" style={{ marginTop: space.s6 }}>
                {percent(apy * 100, { digits: 2, explicitSign: false })}
              </Text>
              <Text variant="secondary" color={colors.ink65} style={{ marginTop: space.s10 }}>
                {rate.data.note}
              </Text>
              {rate.data.feed === 'simulated' ? (
                <Text variant="secondarySm" color={colors.warn} style={{ marginTop: space.s8 }}>
                  This figure is simulated on this chain. It is not what a supply would earn.
                </Text>
              ) : null}
            </SheetCard>

            <SheetCard bordered borderRadius={radius.panel} padding={space.s16}>
              <Text variant="footnote" color={colors.ink40}>
                YOURS
              </Text>
              <Text variant="rowPrimary" style={{ marginTop: space.s6 }}>
                {money(supplied)} supplied · {money(cash)} idle
              </Text>
              <Text variant="secondarySm" color={colors.ink40} style={{ marginTop: space.s8 }}>
                {/*
                  What the rate would be worth on the idle balance — clearly framed as arithmetic on
                  a floating rate, not a projection of earnings.
                */}
                At today&apos;s rate, the idle balance would earn about {money(cash * apy)} over a
                year — if the rate held, which it will not.
              </Text>
            </SheetCard>

            <Button label="Supply or withdraw" variant="ghost" onPress={() => router.push('/yield')} />
          </>
        )}
      </Fill>
    </Screen>
  );
}
