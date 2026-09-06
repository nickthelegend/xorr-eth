/**
 * Your money at Aave, and the way out.
 *
 * Tier 4 can put cash here and deliberately cannot take it back. That is the design, not a
 * gap: burning your own aTokens needs nobody's permission, so the delegation was never given
 * the receipt token — and a permission that cannot be used to trap you is the whole argument
 * this app makes. But a design nobody can act on is indistinguishable from a trap, so the
 * exit needs a screen, and it has to be obvious.
 *
 * The transaction is signed by the user's own wallet and does not touch the delegation.
 */
import React, { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useGoBack } from '@/nav/useGoBack';
import {
  Button,
  Eyebrow,
  Fill,
  IconButton,
  Press,
  Price,
  Screen,
  SheetCard,
  Text,
  colors,
  money,
  percent,
  radius,
  size,
  space,
} from '@/ui';
import { api } from '@/data/api';
import { useAsync } from '@/data/useAsync';
import { useAaveWithdraw, type YieldPosition } from '@/defi/useAaveWithdraw';

/** Quick fractions of the position, plus everything. */
const PORTIONS = [0.25, 0.5, 1] as const;
const PORTION_H = 42;

export default function Yield() {
  const goBack = useGoBack();
  const [portion, setPortion] = useState<number>(1);
  const [txHash, setTxHash] = useState<string>();
  const [nonce, setNonce] = useState(0);
  const { withdraw, busy, error } = useAaveWithdraw();

  const pos = useAsync(() => api.get<YieldPosition>('/yield/position'), [nonce]);
  const p = pos.data;
  const supplied = p?.suppliedUsd ?? 0;
  const amount = supplied * portion;

  const submit = useCallback(async () => {
    // A full withdrawal asks for "all of it" rather than a number: aUSDC accrues every
    // second, so any figure read a moment ago already leaves dust behind.
    const hash = await withdraw(portion === 1 ? (null as unknown as number) : amount).catch(
      () => undefined,
    );
    if (hash) {
      setTxHash(hash);
      setNonce((n) => n + 1);
    }
  }, [withdraw, portion, amount]);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="screenTitle">Earning at Aave</Text>
        <IconButton name="close" accessibilityLabel="Close" onPress={() => goBack()} />
      </View>

      <Fill style={{ marginTop: space.s16 }}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {pos.loading && !p ? (
            <Text variant="body" color={colors.ink40}>
              Reading the pool…
            </Text>
          ) : pos.error ? (
            <SheetCard borderRadius={radius.note} padding={space.s16}>
              <Text variant="rowPrimary" color={colors.down}>
                Could not read the pool.
              </Text>
              <Text variant="secondarySm" color={colors.ink45} style={{ marginTop: space.s6 }}>
                {pos.error.message}
              </Text>
            </SheetCard>
          ) : p && !p.available ? (
            <SheetCard borderRadius={radius.note} padding={space.s16}>
              <Text variant="rowPrimary">No lending pool here.</Text>
              <Text variant="secondarySm" color={colors.ink45} style={{ marginTop: space.s6 }}>
                {p.reason ?? 'Aave v3 is not deployed on this network.'}
              </Text>
              {/* "Nothing supplied" and "nowhere to supply" are different, and the
                  difference matters — the second one is not something the user did. */}
              <Text variant="footnote" color={colors.ink32} style={{ marginTop: space.s10 }}>
                This is about the network, not your balance.
              </Text>
            </SheetCard>
          ) : p ? (
            <>
              <SheetCard borderRadius={radius.note} padding={space.s18}>
                <Eyebrow small>Supplied</Eyebrow>
                <Price variant="heroAmount" style={{ marginTop: space.s6 }}>
                  {money(supplied)}
                </Price>
                <Text variant="secondarySm" color={colors.ink45} style={{ marginTop: space.s8 }}>
                  Earning {percent(p.apy * 100, 2).replace('+', '')} a year. The balance itself
                  grows — there is no claim step and nothing to harvest.
                </Text>
              </SheetCard>

              {supplied <= 0 ? (
                <Text variant="secondarySm" color={colors.ink45} style={{ marginTop: space.s16 }}>
                  Nothing supplied yet. A &ldquo;move idle cash to yield&rdquo; strategy puts
                  spare USDC here automatically, inside your daily cap.
                </Text>
              ) : (
                <>
                  <Eyebrow small style={{ marginTop: space.s20 }}>
                    Withdraw
                  </Eyebrow>
                  <View style={{ flexDirection: 'row', gap: space.s8, marginTop: space.s10 }}>
                    {PORTIONS.map((f) => (
                      <Press
                        key={f}
                        onPress={() => setPortion(f)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: portion === f }}
                        accessibilityLabel={f === 1 ? 'All of it' : `${f * 100} percent`}
                        style={{
                          flex: 1,
                          height: PORTION_H,
                          borderRadius: radius.panel,
                          alignItems: 'center',
                          justifyContent: 'center',
                          // Selection is white-on-dark. Never green: this is a choice, not a
                          // profit.
                          backgroundColor: portion === f ? colors.ink : colors.control,
                        }}
                      >
                        <Text
                          variant="control"
                          color={portion === f ? colors.sheet.ink : colors.ink50}
                        >
                          {f === 1 ? 'All' : `${f * 100}%`}
                        </Text>
                      </Press>
                    ))}
                  </View>

                  <Text variant="secondarySm" color={colors.ink45} style={{ marginTop: space.s14 }}>
                    {portion === 1
                      ? 'Withdraws the whole position, including the interest earned between now and the moment it lands.'
                      : `Withdraws about ${money(amount)}, leaving ${money(supplied - amount)} earning.`}
                  </Text>
                </>
              )}

              {txHash ? (
                <View
                  style={{
                    marginTop: space.s16,
                    padding: space.s14,
                    borderRadius: radius.tile,
                    backgroundColor: colors.surface,
                  }}
                >
                  <Text variant="rowPrimary" color={colors.up}>
                    Withdrawal sent.
                  </Text>
                  <Text
                    variant="footnote"
                    color={colors.ink32}
                    style={{ marginTop: space.s6 }}
                    selectable
                  >
                    {txHash}
                  </Text>
                </View>
              ) : null}

              {error ? (
                <Text variant="secondarySm" color={colors.down} style={{ marginTop: space.s14 }}>
                  {error}
                </Text>
              ) : null}
            </>
          ) : null}
        </ScrollView>
      </Fill>

      <Button
        label={portion === 1 ? 'Withdraw all of it' : `Withdraw ${money(amount)}`}
        height={size.buttonLg}
        disabled={!p?.available || supplied <= 0}
        loading={busy}
        onPress={submit}
      />
      {/* The claim that makes tier 4 safe to hand someone, restated where it is relied on. */}
      <Text
        variant="footnote"
        color={colors.ink28}
        align="center"
        style={{ marginTop: space.s12 }}
      >
        You sign this, not the bot. It was never given the power to take this back out.
      </Text>
    </Screen>
  );
}
