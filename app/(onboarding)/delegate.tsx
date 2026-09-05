/**
 * NEW — Grant delegation. PLAN.md 7.5, closing [G45].
 *
 * The single most consequential screen in the app, and it does not exist in the handoff: this is
 * where a user hands a bot authority over real money.
 *
 * Built from screen 20's consequence-card pattern — that layout already reads correctly for
 * "here is exactly what will and will not happen", which is the whole job here.
 *
 * Voice per copy.md: name the consequence, not the feature. Second person, present tense.
 */
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import { Button, NoteStrip, Screen, ScreenHeader, SheetCard, Stepper } from '@/design/components';
import { ink, pnl } from '@/design/colors';
import { radius } from '@/design/space';
import { type } from '@/design/type';
import { money } from '@/format';
import { CAP_MAX, CAP_MIN, RUN_FOR, capLabel, runForMs } from '@/state/derived';
import { useStore } from '@/state/store';
import { repos } from '@/data';
import { useGrantDelegation } from '@/auth/useGrantDelegation';
import { Pill } from '@/design/components/Pill';

export default function GrantDelegation() {
  const router = useRouter();
  const cap = useStore((s) => s.cap);
  const bumpCap = useStore((s) => s.bumpCap);
  const runFor = useStore((s) => s.runFor);
  const cycleRunFor = useStore((s) => s.cycleRunFor);
  const setDelegation = useStore((s) => s.setDelegation);
  const [localError, setLocalError] = useState<string>();
  // The grant is signed by the user's own wallet. The executor cannot grant itself permission.
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
      const d = await repos.wallet.delegation();
      setDelegation(d);
      router.replace('/proposal');
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Screen>
      <ScreenHeader
        left={<Text style={[type.screenTitle, { color: ink.full }]}>Let the bot trade</Text>}
      />
      <Text style={[type.body, { color: ink.i40, marginTop: 10 }]}>
        This is the permission that lets the bot act while you are not looking. Read what it can and
        cannot do before you sign it.
      </Text>

      <Screen.Content style={{ marginTop: 22 }}>
        <View style={{ gap: 10 }}>
          <Consequence
            dot={pnl.up}
            label="It can place trades"
            detail={`Only on the venues xorr supports, and only up to ${capLabel(cap)}.`}
          />
          <Consequence
            dot={pnl.down}
            label="It cannot move your money out"
            detail="No transfers, no withdrawals, no address it chooses. That permission is never granted."
          />
          <Consequence
            dot={pnl.up}
            label="It expires on its own"
            detail={`After ${RUN_FOR[runFor]} the permission lapses unless you renew it.`}
          />
          <Consequence
            dot={pnl.up}
            label="You can take it back in one tap"
            detail="Safety, then Stop all agents. It takes effect on-chain, not on our servers."
          />
        </View>

        <SheetCard radius={radius.xl} padding={16} style={{ marginTop: 18 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <Text style={[type.rowPrimary, { color: ink.full }]}>Most it can spend a day</Text>
            <Stepper
              value={money(cap, { fractionDigits: 0 })}
              onDecrement={() => bumpCap(-1)}
              onIncrement={() => bumpCap(1)}
              canDecrement={cap > CAP_MIN}
              canIncrement={cap < CAP_MAX}
              valueMinWidth={88}
              accessibilityLabel="Daily spend cap"
            />
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 18,
              gap: 12,
            }}
          >
            <Text style={[type.rowPrimary, { color: ink.full }]}>For how long</Text>
            <Pill label={RUN_FOR[runFor]!} selected onPress={cycleRunFor} />
          </View>
        </SheetCard>

        <NoteStrip kind="risk" style={{ marginTop: 16 }}>
          A bot with permission to trade can lose money inside these limits. The limits cap the
          damage; they do not prevent it.
        </NoteStrip>

        {error ? (
          <Text style={[type.noteBody, { color: pnl.down, marginTop: 14 }]}>{error}</Text>
        ) : null}
      </Screen.Content>

      <Button label="Sign this permission" loading={busy} onPress={grant} />
      <Button
        label="Not yet — look around first"
        variant="ghost"
        style={{ marginTop: 10 }}
        onPress={() => router.replace('/(tabs)')}
      />
    </Screen>
  );
}

function Consequence({ dot, label, detail }: { dot: string; label: string; detail: string }) {
  return (
    <SheetCard radius={radius.lg} padding={14}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View
          style={{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: dot, marginTop: 4 }}
        />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[type.rowPrimary, { color: ink.full }]}>{label}</Text>
          <Text style={[type.secondary, { color: ink.i38 }]}>{detail}</Text>
        </View>
      </View>
    </SheetCard>
  );
}
