/**
 * Your money at Aave, and the way out.
 *
 * Tier 4 can put cash here and deliberately cannot take it back. That is the design, not a gap:
 * burning your own aTokens needs nobody's permission, so the delegation was never given the
 * receipt token — and a permission that cannot be used to trap you is the whole argument this app
 * makes. But a design nobody can act on is indistinguishable from a trap, so the exit needs a
 * screen, and it has to be obvious.
 *
 * The transaction is signed by the user's own wallet and does not touch the delegation at all.
 */
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, IconButton, Screen, ScreenHeader, SheetCard } from '@/design/components';
import { ink, pnl, surfaces } from '@/design/colors';
import { radius } from '@/design/space';
import { type } from '@/design/type';
import { money, percent } from '@/format';
import { api } from '@/data/api';
import { useAsync } from '@/data/useAsync';
import { useAaveWithdraw, type YieldPosition } from '@/defi/useAaveWithdraw';

/** Quick fractions of the position, plus everything. */
const PORTIONS = [0.25, 0.5, 1] as const;

export default function Yield() {
  const router = useRouter();
  const [portion, setPortion] = useState<number>(1);
  const [txHash, setTxHash] = useState<string>();
  const [nonce, setNonce] = useState(0);
  const { withdraw, busy, error } = useAaveWithdraw();

  const pos = useAsync(() => api.get<YieldPosition>('/yield/position'), [nonce]);
  const p = pos.data;
  const supplied = p?.suppliedUsd ?? 0;
  const amount = supplied * portion;

  const submit = useCallback(async () => {
    // A full withdrawal asks for "all of it" rather than a number: aUSDC accrues every second, so
    // any figure read a moment ago already leaves dust behind.
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
      <ScreenHeader
        left={<Text style={[type.screenTitle, { color: ink.full }]}>Earning at Aave</Text>}
        right={<IconButton name="close" onPress={() => router.back()} accessibilityLabel="Close" />}
      />

      <Screen.Content style={{ marginTop: 16 }}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {pos.loading && !p ? (
            <Text style={[type.body, { color: ink.i40 }]}>Reading the pool…</Text>
          ) : pos.error ? (
            <SheetCard radius={radius.lg} padding={16}>
              <Text style={[type.rowPrimary, { color: pnl.down }]}>Could not read the pool.</Text>
              <Text style={[type.noteBody, { color: ink.i45, marginTop: 6 }]}>
                {pos.error.message}
              </Text>
            </SheetCard>
          ) : p && !p.available ? (
            <SheetCard radius={radius.lg} padding={16}>
              <Text style={[type.rowPrimary, { color: ink.full }]}>No lending pool here.</Text>
              <Text style={[type.noteBody, { color: ink.i45, marginTop: 6 }]}>
                {p.reason ?? 'Aave v3 is not deployed on this network.'}
              </Text>
              {/* "Nothing supplied" and "nowhere to supply" are different, and the difference
                  matters — the second one is not something the user did. */}
              <Text style={[type.footnote, { color: ink.i32, marginTop: 10 }]}>
                This is about the network, not your balance.
              </Text>
            </SheetCard>
          ) : p ? (
            <>
              <SheetCard radius={radius.lg} padding={18}>
                <Text style={[type.eyebrowSm, { color: ink.i32 }]}>SUPPLIED</Text>
                <Text style={[type.heroAmount, { color: ink.full, marginTop: 6 }]}>
                  {money(supplied)}
                </Text>
                <Text style={[type.noteBody, { color: ink.i45, marginTop: 8 }]}>
                  Earning {percent(p.apy * 100, { digits: 2 }).replace('+', '')} a year. The balance
                  itself grows — there is no claim step and nothing to harvest.
                </Text>
              </SheetCard>

              {supplied <= 0 ? (
                <Text style={[type.noteBody, { color: ink.i45, marginTop: 16 }]}>
                  Nothing supplied yet. A "move idle cash to yield" strategy puts spare USDC here
                  automatically, inside your daily cap.
                </Text>
              ) : (
                <>
                  <Text style={[type.eyebrowSm, { color: ink.i32, marginTop: 20 }]}>
                    WITHDRAW
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    {PORTIONS.map((f) => (
                      <Pressable
                        key={f}
                        onPress={() => setPortion(f)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: portion === f }}
                        accessibilityLabel={f === 1 ? 'All of it' : `${f * 100} percent`}
                        style={{
                          flex: 1,
                          height: 42,
                          borderRadius: radius.xl,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: portion === f ? ink.full : surfaces.control,
                        }}
                      >
                        <Text
                          style={[type.pill, { color: portion === f ? '#0B0B0B' : ink.i50 }]}
                        >
                          {f === 1 ? 'All' : `${f * 100}%`}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text style={[type.noteBody, { color: ink.i45, marginTop: 14 }]}>
                    {portion === 1
                      ? 'Withdraws the whole position, including the interest earned between now and the moment it lands.'
                      : `Withdraws about ${money(amount)}, leaving ${money(supplied - amount)} earning.`}
                  </Text>
                </>
              )}

              {txHash ? (
                <View
                  style={{
                    marginTop: 16,
                    padding: 14,
                    borderRadius: radius.md2,
                    backgroundColor: surfaces.surface,
                  }}
                >
                  <Text style={[type.rowPrimary, { color: pnl.up }]}>Withdrawal sent.</Text>
                  <Text style={[type.footnote, { color: ink.i32, marginTop: 6 }]}>{txHash}</Text>
                </View>
              ) : null}

              {error ? (
                <Text style={[type.noteBody, { color: pnl.down, marginTop: 14 }]}>{error}</Text>
              ) : null}
            </>
          ) : null}
        </ScrollView>
      </Screen.Content>

      <Button
        label={portion === 1 ? 'Withdraw all of it' : `Withdraw ${money(amount)}`}
        variant="primary"
        height={56}
        disabled={!p?.available || supplied <= 0}
        loading={busy}
        onPress={submit}
      />
      {/*
        The claim that makes tier 4 safe to hand someone, restated where it is being relied on.
      */}
      <Text style={[type.footnote, { color: ink.i28, textAlign: 'center', marginTop: 12 }]}>
        You sign this, not the bot. It was never given the power to take this back out.
      </Text>
    </Screen>
  );
}
