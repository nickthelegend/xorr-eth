/**
 * The daily cap, what it has spent, and what is left.
 *
 * `/limits` has always been the number that decides whether the next run happens, and the app only
 * ever showed it as a consequence — a strategy that came back `daily_cap` with no way to see how
 * close it was. A limit you cannot watch approaching is a limit you only meet by surprise.
 *
 * The bar is a proportion, not a decoration: it fills by `spent / cap`, so the gap between the fill
 * and the end is the money still available today. Nothing here is animated except that width, which
 * is the one thing on screen that is genuinely a quantity changing.
 */
import React from 'react';
import { View } from 'react-native';
import { useGoBack } from '@/nav/useGoBack';
import {
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
import { money } from '@/format';
import { useAsync } from '@/data/useAsync';
import { system } from '@/data/system';
import { expiryState } from '@/state/derived';

/** The spend bar. Tall enough to read as a quantity, short enough not to read as a control. */
const BAR_H = 8;

export default function Limits() {
  const goBack = useGoBack();
  const { data, loading, error, reload } = useAsync(() => system.limits(), []);

  /*
   * Guarded, because a cap of zero is a real state — a revoked or never-granted permission — and
   * `spent / 0` is Infinity, which renders as a full bar and says the opposite of the truth.
   */
  const fraction =
    data && data.dailyCapUsd > 0 ? Math.min(1, data.spentTodayUsd / data.dailyCapUsd) : 0;

  /** Not revoked and still unable to spend: the permission reached the end date the user set. */
  const expired = expiryState(data?.expiresAt) === 'expired';

  return (
    <Screen>
      <HeaderBar onBack={goBack} title={<Text variant="screenTitle">Today&apos;s limit</Text>} />

      <Fill style={{ marginTop: space.s20, gap: space.s12 }}>
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : loading && !data ? (
          <View style={{ gap: space.s12 }}>
            <Placeholder height={140} />
            <Placeholder height={86} />
          </View>
        ) : !data ? null : (
          <>
            <SheetCard bordered borderRadius={radius.panel} padding={space.s18}>
              <Text variant="footnote" color={colors.ink40}>
                REMAINING TODAY
              </Text>
              {/*
                A zero has to say which zero it is.

                "Nothing — permission is off" covers a revoked grant. An EXPIRED one is not
                revoked, so it fell through to `money(0)` and rendered a flat **$0** under a
                $1,600 daily cap with nothing spent — a contradiction the screen gave no way to
                resolve. Expiry is read through `expiryState`, the same helper the safety screen's
                banner uses, so the two cannot drift apart.
              */}
              <Text
                variant="screenTitle"
                color={data.revoked || expired ? colors.ink40 : colors.ink}
                style={{ marginTop: space.s6 }}
              >
                {data.revoked
                  ? 'Nothing — permission is off'
                  : expired
                    ? 'Nothing — permission has ended'
                    : money(Math.max(0, data.remainingUsd))}
              </Text>

              {/*
                Drawn here rather than reaching for `Progress`, which is the onboarding step
                indicator — it takes `step`/`total` and renders a back button beside the bar.
                Bending it into a proportion meter would put a back arrow in the middle of a
                spending limit.

                Static, because the value does not change while it is being read. `Placeholder`
                pulses; a number does not.
              */}
              <View
                style={{
                  height: BAR_H,
                  borderRadius: BAR_H / 2,
                  backgroundColor: colors.control,
                  marginTop: space.s16,
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    width: `${fraction * 100}%`,
                    height: '100%',
                    borderRadius: BAR_H / 2,
                    backgroundColor: fraction >= 1 ? colors.down : colors.ink,
                  }}
                />
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  marginTop: space.s10,
                }}
              >
                <Text variant="secondarySm" color={colors.ink40}>
                  {money(data.spentTodayUsd)} spent
                </Text>
                <Text variant="secondarySm" color={colors.ink40}>
                  {money(data.dailyCapUsd)} cap
                </Text>
              </View>
            </SheetCard>

            <SheetCard bordered borderRadius={radius.panel} padding={space.s16}>
              <Text variant="secondary" color={colors.ink65}>
                {/*
                  Which limit binds, said plainly. The cap is enforced in two places — the contract
                  and the executor's own tally — and the stricter one wins, so "the cap" is not one
                  number in one place and saying so is more honest than a single figure implies.
                */}
                The cap resets at midnight UTC. It is enforced on the chain and again by the
                executor before every run, and the stricter of the two is the one that binds.
              </Text>
            </SheetCard>
          </>
        )}
      </Fill>
    </Screen>
  );
}
