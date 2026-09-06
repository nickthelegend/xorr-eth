/**
 * Recovery — PLAN.md 10.8 [G31].
 *
 * Screen 20 shows "Not backed up" in `warn` with nowhere to go. After the pivot this is not
 * a nicety: NON-CUSTODIAL MEANS LOSING THE KEY LOSES THE FUNDS.
 *
 * It offered a "Reveal phrase" button over a panel that revealed no phrase, so the button
 * went. Then the replacement text was wrong in the other direction, and stayed wrong through
 * the pivot: it told the user "its key is held by the executor" and "this wallet is not yours
 * alone" — describing a Solana devnet keypair the executor generated, on a build where the
 * wallet has been a Privy embedded wallet for months and the executor has never held a user
 * key at all.
 *
 * That is the worst sentence in the app to get wrong. This is the screen whose entire job is
 * to say where the key is, and it was telling a user that a wallet they solely control is
 * shared with us — which would reasonably stop them funding it, and is not true.
 *
 * So it says what is actually the case: Privy holds the key in a way that needs the user's own
 * auth to use, xorr never sees it, and the recovery that matters is the login itself.
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
        This is a Privy embedded wallet on {wallet?.chain ?? wallet?.cluster ?? 'Base'}. Its key
        is split so that no single party — not Privy, and certainly not xorr — can reconstruct
        it alone; using it needs you to be signed in. xorr never sees it, which is why the bot
        gets a permission instead of a key.
      </Text>

      <Fill style={{ marginTop: space.s22 }}>
        <SheetCard borderRadius={radius.panel} padding={space.s18}>
          <Text variant="cardTitle">What recovery means here</Text>
          <Text variant="secondarySm" color={colors.ink45} style={{ marginTop: space.s10 }}>
            There is no phrase to write down, and that is the design rather than something
            missing: your login IS the recovery. Sign in on a new device with the same email
            and the same wallet is there. Lose access to that email and you lose the wallet —
            xorr cannot recover it for you, because xorr never had it.
          </Text>
          <Text variant="secondarySm" color={colors.ink45} style={{ marginTop: space.s12 }}>
            The bot never gets that key. It gets a separate on-chain permission that can
            trade and cannot withdraw, and you can revoke it from Safety at any time.
          </Text>
        </SheetCard>

        {/*
          The warning is about the NETWORK, which is a fact we can check, rather than about
          custody, which the previous version got backwards.
        */}
        {wallet?.chain && wallet.chain !== 'base' ? (
          <NoteStrip kind="blocked" style={{ marginTop: space.s16 }}>
            This wallet is on {wallet.chain}, not Base mainnet. Nothing here is real money.
          </NoteStrip>
        ) : (
          <NoteStrip kind="risk" style={{ marginTop: space.s16 }}>
            Keep the email you signed in with. It is the only way back to this wallet.
          </NoteStrip>
        )}
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
        color={colors.ink28}
        align="center"
        style={{ marginTop: space.s12 }}
      >
        The bot never gets this key — only a permission you can revoke.
      </Text>
    </Screen>
  );
}
