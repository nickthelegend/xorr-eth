/**
 * Settings — PLAN.md 10.3 [G14]. The Home gear had no destination.
 * Wallet, delegation status + revoke, security, notifications, the TONE DIAL, legal, sign out.
 */
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { IconButton, Row, Screen, ScreenHeader, Segmented, SheetCard } from '@/design/components';
import { ink, pnl } from '@/design/colors';
import { radius } from '@/design/space';
import { type } from '@/design/type';
import { capLabel } from '@/state/derived';
import { useStore } from '@/state/store';
import { TONES, useTone } from '@/bot/tone';

export default function Settings() {
  const router = useRouter();
  const wallet = useStore((s) => s.wallet);
  const delegation = useStore((s) => s.delegation);
  const cap = useStore((s) => s.cap);
  const killed = useStore((s) => s.killed);
  const { tone, setTone } = useTone();

  return (
    <Screen>
      <ScreenHeader
        left={<Text style={[type.screenTitle, { color: ink.full }]}>Settings</Text>}
        right={
          <IconButton name="close" accessibilityLabel="Close" onPress={() => router.back()} />
        }
      />

      <Screen.Content style={{ marginTop: 20 }}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={[type.eyebrowSm, { color: ink.i32 }]}>Wallet</Text>
          <Row
            primary="Address"
            value={wallet ? `${wallet.address.slice(0, 4)}…${wallet.address.slice(-4)}` : 'None'}
            valueColor={ink.i55}
            height={54}
          />
          <Row
            primary="Network"
            value={wallet?.cluster ?? '—'}
            valueColor={ink.i55}
            height={54}
          />
          <Row
            primary="Recovery phrase"
            value="Not backed up"
            valueColor={pnl.warn}
            height={54}
            onPress={() => router.push('/recovery')}
          />

          <Text style={[type.eyebrowSm, { color: ink.i32, marginTop: 26 }]}>
            What the bot may do
          </Text>
          <Row
            primary="Status"
            value={killed || delegation?.revoked ? 'Stopped' : 'Live'}
            valueColor={killed || delegation?.revoked ? ink.i55 : pnl.up}
            height={54}
            onPress={() => router.push('/safety')}
          />
          <Row primary="Daily cap" value={capLabel(cap)} valueColor={ink.i55} height={54} />
          <Row
            primary="Withdrawal allowlist"
            value="2 addresses"
            valueColor={ink.i55}
            height={54}
            onPress={() => router.push('/allowlist')}
          />

          <Text style={[type.eyebrowSm, { color: ink.i32, marginTop: 26 }]}>How the bot talks</Text>
          <SheetCard radius={radius.xl} padding={16} style={{ marginTop: 10 }}>
            <Segmented
              options={TONES.map((t) => t.label)}
              value={TONES.findIndex((t) => t.id === tone)}
              onChange={(i) => setTone(TONES[i]!.id)}
              accessibilityLabel="Tone"
            />
            <Text style={[type.noteBody, { color: ink.i45, marginTop: 12 }]}>
              {TONES.find((t) => t.id === tone)?.description}
            </Text>
            <Text style={[type.footnote, { color: ink.i28, marginTop: 10 }]}>
              This changes how the bot writes, never what it reports. Prices, sizes and limits read
              the same on every setting.
            </Text>
          </SheetCard>

          <Text style={[type.eyebrowSm, { color: ink.i32, marginTop: 26 }]}>Alerts</Text>
          <Row
            primary="Notifications"
            value="Manage"
            valueColor={ink.i55}
            height={54}
            onPress={() => router.push('/alerts')}
          />

          <Text style={[type.eyebrowSm, { color: ink.i32, marginTop: 26 }]}>Legal</Text>
          <Row primary="Terms" value="" height={54} onPress={() => router.push('/legal/terms')} />
          <Row
            primary="Privacy policy"
            value=""
            height={54}
            onPress={() => router.push('/legal/privacy')}
          />
          <Row
            primary="Risk disclosure"
            value=""
            height={54}
            divider={false}
            onPress={() => router.push('/legal/risk')}
          />
          <View style={{ height: 30 }} />
        </ScrollView>
      </Screen.Content>
    </Screen>
  );
}
