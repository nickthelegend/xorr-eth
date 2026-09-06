/**
 * Send / withdraw — PLAN.md 10.6 [G14].
 *
 * PLAN.md §3.4: withdrawals may go ONLY to a user-allowlisted destination. This screen
 * cannot enter a free-form address on purpose — that constraint is the product, not a
 * limitation.
 *
 * What it also cannot do, in this build, is send: there is no withdrawal path in the
 * executor, and the wallet is a devnet wallet whose key the executor holds. The screen
 * previously implied otherwise — an "Amount $0.00" row that looked like an input but was a
 * label, over a permanently disabled "Review withdrawal". A screen that looks like it
 * takes an amount and silently does not is worse than one that says so, so it says so.
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Button,
  Eyebrow,
  Fill,
  IconButton,
  NoteStrip,
  RadioCard,
  Screen,
  Text,
  colors,
  space,
} from '@/ui';
import { useAllowlist } from '@/wallet/allowlist';

export default function Send() {
  const router = useRouter();
  const { addresses, pendingFor } = useAllowlist();
  const [selected, setSelected] = useState(0);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s8 }}>
        <IconButton
          name="back"
          accessibilityLabel="Back"
          background="none"
          onPress={() => router.back()}
        />
        <Text variant="screenTitle">Send</Text>
      </View>

      <Text variant="secondary" style={{ marginTop: space.s10 }}>
        Funds can only leave to an address you have already allowlisted. That is what stops
        a compromised phone from draining the wallet.
      </Text>

      <Fill style={{ marginTop: space.s22 }}>
        <Eyebrow small>Destination</Eyebrow>
        <View style={{ gap: space.s10, marginTop: space.s12 }}>
          {addresses.map((a, i) => (
            <RadioCard
              key={a.address}
              title={a.label}
              detail={a.address}
              tag={pendingFor(a) ? 'Pending' : undefined}
              selected={i === selected}
              onPress={() => setSelected(i)}
              showRadio={false}
            />
          ))}
        </View>

        <NoteStrip kind="risk" style={{ marginTop: space.s16 }}>
          A new address takes effect after a cooling-off period. Adding one now does not let
          you send to it today.
        </NoteStrip>

        <NoteStrip kind="blocked" style={{ marginTop: space.s10 }}>
          Withdrawals are not enabled in this build. The wallet is on a test network and the
          executor has no transfer-out path — by design, so that nothing in the app can move
          funds off the venue account.
        </NoteStrip>
      </Fill>

      <Button
        label="Manage allowlist"
        variant="ghost"
        onPress={() => router.push('/allowlist')}
        style={{ marginBottom: space.s10 }}
      />
      <Button label="Withdrawals not enabled" disabled />
      <Text
        variant="footnote"
        color={colors.ink28}
        align="center"
        style={{ marginTop: space.s12 }}
      >
        The allowlist above is live, so it is ready the day this is.
      </Text>
    </Screen>
  );
}
