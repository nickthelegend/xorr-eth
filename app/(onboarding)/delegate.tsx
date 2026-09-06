/**
 * NEW — Grant delegation. PLAN.md 7.5, closing [G45].
 *
 * The single most consequential screen in the app, and it does not exist in the handoff:
 * this is where a user hands a bot authority over real money.
 *
 * Built from screen 20's consequence-card pattern — that layout already reads correctly for
 * "here is exactly what will and will not happen", which is the whole job here.
 *
 * Voice per copy.md: name the consequence, not the feature. Second person, present tense.
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import {
  Button,
  ConsequenceCard,
  Fill,
  NoteStrip,
  Pill,
  Screen,
  SheetCard,
  Stepper,
  Text,
  colors,
  money,
  radius,
  size,
  space,
} from '@/ui';
import { useGrantDelegation } from '@/auth/useGrantDelegation';
import { CAP_MAX, CAP_MIN, RUN_FOR, capLabel, runForMs } from '@/state/derived';
import { useStore } from '@/state/store';
import { repos } from '@/data';


export default function GrantDelegation() {
  const router = useRouter();
  const cap = useStore((s) => s.cap);
  const bumpCap = useStore((s) => s.bumpCap);
  const runFor = useStore((s) => s.runFor);
  const cycleRunFor = useStore((s) => s.cycleRunFor);
  const setDelegation = useStore((s) => s.setDelegation);
  const [localError, setLocalError] = useState<string>();
  // The grant is signed by the USER's own wallet. The executor cannot grant itself
  // permission — that is the whole point of the delegation being on-chain.
  const { grant: signGrant, busy, error: grantError } = useGrantDelegation();
  const error = localError ?? grantError;

  async function grant() {
    setLocalError(undefined);
    try {
      const hasHw = await LocalAuthentication.hasHardwareAsync().catch(() => false);
      if (hasHw && (await LocalAuthentication.isEnrolledAsync().catch(() => false))) {
        const res = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Let the bot trade inside your limits',
        });
        if (!res.success) {
          setLocalError('Not confirmed — no permission was granted.');
          return;
        }
      }
      await signGrant(cap, runForMs(runFor));
      // Read it back from the chain rather than trusting what we just sent.
      const d = await repos.wallet.delegation();
      setDelegation(d);
      router.replace('/proposal');
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Screen>
      <Text variant="screenTitle">Let the bot trade</Text>
      <Text variant="body" color={colors.ink40} style={{ marginTop: space.s10 }}>
        This is the permission that lets the bot act while you are not looking. Read what it
        can and cannot do before you sign it.
      </Text>

      <Fill style={{ marginTop: space.s22 }}>
        <View style={{ gap: space.s10 }}>
          <ConsequenceCard
            tone="up"
            label="It can place trades"
            detail={`Only on the venues xorr supports, and only up to ${capLabel(cap)}.`}
          />
          <ConsequenceCard
            tone="down"
            label="It cannot move your money out"
            detail="No transfers, no withdrawals, no address it chooses. That permission is never granted."
          />
          <ConsequenceCard
            tone="up"
            label="It expires on its own"
            detail={`After ${RUN_FOR[runFor]} the permission lapses unless you renew it.`}
          />
          <ConsequenceCard
            tone="up"
            label="You can take it back in one tap"
            detail="Safety, then Stop all agents. It takes effect on-chain, not on our servers."
          />
        </View>

        <SheetCard borderRadius={radius.panel} padding={space.s16} style={{ marginTop: space.s18 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: space.s12,
            }}
          >
            <Text variant="rowPrimary">Most it can spend a day</Text>
            <Stepper
              value={money(cap, { decimals: 0 })}
              onDecrement={() => bumpCap(-1)}
              onIncrement={() => bumpCap(1)}
              canDecrement={cap > CAP_MIN}
              canIncrement={cap < CAP_MAX}
              valueMinWidth={size.stepperValueMinW}
            />
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: space.s18,
              gap: space.s12,
            }}
          >
            <Text variant="rowPrimary">For how long</Text>
            <Pill label={RUN_FOR[runFor]!} selected onPress={cycleRunFor} />
          </View>
        </SheetCard>

        <NoteStrip kind="risk" style={{ marginTop: space.s16 }}>
          A bot with permission to trade can lose money inside these limits. The limits cap
          the damage; they do not prevent it.
        </NoteStrip>

        {error ? (
          <Text variant="secondarySm" color={colors.down} style={{ marginTop: space.s14 }}>
            {error}
          </Text>
        ) : null}
      </Fill>

      <Button label="Sign this permission" loading={busy} onPress={grant} />
      <Button
        label="Not yet — look around first"
        variant="ghost"
        style={{ marginTop: space.s10 }}
        onPress={() => router.replace('/(tabs)')}
      />
    </Screen>
  );
}

