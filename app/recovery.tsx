/**
 * Recovery — PLAN.md 10.8 [G31].
 *
 * Screen 20 shows "Not backed up" in `warn` with nowhere to go. After the pivot this is not
 * a nicety: NON-CUSTODIAL MEANS LOSING THE KEY LOSES THE FUNDS.
 *
 * What this screen used to do was worse than nothing. It offered a "Reveal phrase" button
 * over a panel that revealed no phrase — because in this build there is no user-held
 * phrase to reveal. The wallet is the devnet owner keypair, and `server/src/solana/keys.ts`
 * says so outright: *"In production the OWNER key lives on the user's device, never here.
 * For devnet development the owner keypair is generated locally."*
 *
 * So the screen states that, in those terms. A user cannot make a good decision about a
 * risk we have described inaccurately, and a fake reveal button on a recovery screen is the
 * single most dangerous placeholder this app could ship.
 */
import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Button,
  Fill,
  IconButton,
  NoteStrip,
  Screen,
  SheetCard,
  Text,
  colors,
  radius,
  space,
} from '@/ui';
import { useStore } from '@/state/store';

export default function Recovery() {
  const router = useRouter();
  const wallet = useStore((s) => s.wallet);
  const setRecoveryBackedUp = useStore((s) => s.setRecoveryBackedUp);
  const acknowledged = useStore((s) => s.recoveryBackedUp);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s8 }}>
        <IconButton
          name="back"
          accessibilityLabel="Back"
          background="none"
          onPress={() => router.back()}
        />
        <Text variant="screenTitle">Recovery</Text>
      </View>

      <Text variant="onboardingTitle" style={{ marginTop: space.s20 }}>
        Where the key actually is
      </Text>
      <Text variant="body" color={colors.ink40} style={{ marginTop: space.s10 }}>
        This is a {wallet?.cluster ?? 'development'} wallet. Its key is held by the executor
        so the whole trading flow can run end to end without a device signature on every
        step. That means there is no recovery phrase for you to write down yet — and it
        also means this wallet is not yours alone.
      </Text>

      <Fill style={{ marginTop: space.s22 }}>
        <SheetCard borderRadius={radius.panel} padding={space.s18}>
          <Text variant="cardTitle">What changes on mainnet</Text>
          <Text variant="secondarySm" color={colors.ink45} style={{ marginTop: space.s10 }}>
            The key is generated on your device and never leaves it. xorr does not hold it,
            which means xorr cannot recover it: if you lose the device and have no backup,
            the funds in that wallet are gone, and there is no support line for that. You
            will be given a phrase at that point, and this screen is where you will read it.
          </Text>
          <Text variant="secondarySm" color={colors.ink45} style={{ marginTop: space.s12 }}>
            The bot never gets that key. It gets a separate on-chain permission that can
            trade and cannot withdraw, and you can revoke it from Safety at any time.
          </Text>
        </SheetCard>

        <NoteStrip kind="blocked" style={{ marginTop: space.s16 }}>
          Do not put real money in this wallet. It is on a test network, and the key is not
          exclusively yours.
        </NoteStrip>
      </Fill>

      <Button
        label={acknowledged ? 'Understood' : 'I understand'}
        onPress={() => {
          setRecoveryBackedUp(true);
          router.back();
        }}
      />
      <Text
        variant="footnote"
        color={colors.warn}
        align="center"
        style={{ marginTop: space.s12 }}
      >
        Until the key is on your device, this wallet has a single point of failure.
      </Text>
    </Screen>
  );
}
