/**
 * Screen 20 — Kill switch. screens.md Group C.
 *
 * A state chip (7px dot + LIVE/STOPPED). State-driven title and explanation.
 * Three consequence cards: New orders (down) / Stops and take-profits (up) / Open positions (up).
 * Three settings rows: Face ID for every payout / Withdrawal allowlist / Recovery phrase (warn).
 * A 56px/700 button — #EF3B36 "Stop all agents" <-> white "Resume agents".
 *
 * PLAN.md 6.10 / 12.5: after the pivot this button SIGNS AN ON-CHAIN REVOKE. The footnote
 * "Takes effect in under a second across every device" becomes true by construction, because the
 * authority is revoked at the chain, not at a server we have to fan out from.
 */
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import { Button, IconButton, Row, Screen, ScreenHeader, SheetCard } from '@/design/components';
import { ink, pnl, surfaces } from '@/design/colors';
import { radius } from '@/design/space';
import { type } from '@/design/type';
import { killCta, killExplanation, killTitle } from '@/state/derived';
import { useStore } from '@/state/store';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import { useGrantDelegation } from '@/auth/useGrantDelegation';

export default function Safety() {
  // How many agents can actually place an order right now, from the server. Counting a boolean in
  // browser state would make the kill switch's own explanation a guess.
  const roster = useAsync(() => repos.bot.listAgents(), []);
  const hiredCount = (roster.data ?? []).filter((a) => a.hired).length;
  const router = useRouter();
  const killed = useStore((s) => s.killed);
  const setKilled = useStore((s) => s.setKilled);
  const setDelegation = useStore((s) => s.setDelegation);

  const cap = useStore((s) => s.cap);
  const [localError, setLocalError] = useState<string>();
  // Signed by the user, on-chain. This is why "under a second across every device" is true
  // without any server needing to be reachable.
  const { grant: signGrant, revoke: signRevoke, busy, error: txError } = useGrantDelegation();
  const error = localError ?? txError;

  async function toggle() {
    setLocalError(undefined);
    try {
      // Biometrics gate every change to what the bot may do. PLAN.md 12.20.
      const hasHw = await LocalAuthentication.hasHardwareAsync().catch(() => false);
      const enrolled = hasHw ? await LocalAuthentication.isEnrolledAsync().catch(() => false) : false;
      if (enrolled) {
        const res = await LocalAuthentication.authenticateAsync({
          promptMessage: killed ? 'Resume your agents' : 'Stop all agents',
        });
        if (!res.success) {
          setLocalError('Not confirmed — nothing changed.');
          return;
        }
      }
      if (killed) await signGrant(cap, 86_400_000);
      else await signRevoke();
      setDelegation(await repos.wallet.delegation());
      setKilled(!killed);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Screen>
      <ScreenHeader
        left={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <IconButton
              name="back"
              accessibilityLabel="Back"
              background="transparent"
              color={ink.i55}
              onPress={() => router.back()}
            />
            <Text style={[type.screenTitle, { color: ink.full }]}>Safety</Text>
          </View>
        }
      />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          alignSelf: 'flex-start',
          marginTop: 20,
          backgroundColor: surfaces.surfaceAlt,
          borderRadius: radius.lg2,
          paddingHorizontal: 12,
          paddingVertical: 7,
        }}
      >
        <View
          style={{
            width: 7,
            height: 7,
            borderRadius: 3.5,
            backgroundColor: killed ? ink.i30 : pnl.up,
          }}
        />
        <Text style={[type.tagSm, { color: killed ? ink.i55 : pnl.up }]}>
          {killed ? 'Stopped' : 'Live'}
        </Text>
      </View>

      <Text style={[type.onboardingTitle, { color: ink.full, marginTop: 16 }]}>
        {killTitle(killed)}
      </Text>
      <Text style={[type.body, { color: ink.i40, marginTop: 8 }]}>
        {killExplanation(killed, hiredCount)}
      </Text>

      <Screen.Content style={{ marginTop: 20 }}>
        <View style={{ gap: 10 }}>
          <Consequence
            dot={pnl.down}
            label="New orders"
            detail="Stopped immediately"
          />
          <Consequence
            dot={pnl.up}
            label="Stops and take-profits"
            detail="Stay active — your risk is still covered"
          />
          <Consequence dot={pnl.up} label="Open positions" detail="Left exactly as they are" />
        </View>

        <SheetCard radius={radius.xl} padding={16} style={{ marginTop: 18 }}>
          <Row primary="Face ID for every payout" value="On" valueColor={ink.i55} height={52} />
          <Row
            primary="Withdrawal allowlist"
            value="2 addresses"
            valueColor={ink.i55}
            height={52}
            onPress={() => router.push('/allowlist')}
          />
          <Row
            primary="Recovery phrase"
            value="Not backed up"
            valueColor={pnl.warn}
            height={52}
            divider={false}
            onPress={() => router.push('/recovery')}
          />
        </SheetCard>

        {error ? (
          <Text style={[type.noteBody, { color: pnl.down, marginTop: 14 }]}>{error}</Text>
        ) : null}
      </Screen.Content>

      <Button
        label={killCta(killed)}
        variant={killed ? 'primary' : 'destructive'}
        height={56}
        loading={busy}
        onPress={toggle}
      />
      <Text style={[type.footnote, { color: ink.i28, textAlign: 'center', marginTop: 12 }]}>
        Takes effect in under a second across every device.
      </Text>
      {/*
        Stopping and exiting are different needs, and only the first one was offered.
        Deliberately a quiet secondary link rather than a second big red button: two destructive
        buttons of equal weight is how someone taps the wrong one.
      */}
      <Text
        onPress={() => router.push('/flatten')}
        accessibilityRole="button"
        accessibilityLabel="Sell every position into USDC"
        style={[type.footnote, { color: ink.i45, textAlign: 'center', marginTop: 14, paddingVertical: 6 }]}
      >
        Stopping is not selling. Sell everything into cash ›
      </Text>
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
