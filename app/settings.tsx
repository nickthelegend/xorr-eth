/**
 * Settings — PLAN.md 10.3 [G14]. The Home gear had no destination.
 * Wallet, delegation status + revoke, security, notifications, the TONE DIAL, legal.
 */
import React from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useGoBack } from '@/nav/useGoBack';
import {
  Eyebrow,
  Fill,
  IconButton,
  Price,
  Row,
  Screen,
  Segmented,
  SheetCard,
  Text,
  colors,
  radius,
  size,
  space,
} from '@/ui';
import { capLabel } from '@/state/derived';
import { useStore } from '@/state/store';
import { useAllowlist } from '@/wallet/allowlist';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import { TONES, useTone } from '@/bot/tone';

const SETTING_ROW = 54;
const TONE_OPTIONS = TONES.map((t) => ({ value: t.id, label: t.label }));

export default function Settings() {
  const router = useRouter();
  const goBack = useGoBack();
  // The store's `wallet` is only ever set by the onboarding screen, so deep-linking here —
  // or opening Settings in a session that did not run onboarding — showed "Address: None"
  // and "Network: —" for a user who has a wallet. Read the source of truth, like every
  // other screen does, and fall back to the store only while that request is in flight.
  const stored = useStore((s) => s.wallet);
  const { data: fetched, error: walletError } = useAsync(() => repos.wallet.current(), []);
  const wallet = fetched ?? stored;
  // "None" and "—" are claims about the wallet. If we could not reach the executor we have
  // no claim to make, so say that instead.
  const unreachable = walletError !== undefined && !wallet;
  const delegation = useStore((s) => s.delegation);
  const cap = useStore((s) => s.cap);
  const killed = useStore((s) => s.killed);
  const recoveryBackedUp = useStore((s) => s.recoveryBackedUp);
  const { addresses } = useAllowlist();
  const { tone, setTone } = useTone();

  const stopped = killed || delegation?.revoked;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="screenTitle">Settings</Text>
        <IconButton name="close" accessibilityLabel="Close" onPress={() => goBack()} />
      </View>

      <Fill style={{ marginTop: space.s20 }}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Eyebrow small>Wallet</Eyebrow>
          <Row
            title="Address"
            value={
              <Price color={colors.ink55}>
                {wallet
                  ? `${wallet.address.slice(0, 4)}…${wallet.address.slice(-4)}`
                  : unreachable
                    ? 'Could not reach the executor'
                    : 'None'}
              </Price>
            }
            height={SETTING_ROW}
          />
          <Row
            title="Network"
            value={<Text variant="rowPrimary" color={colors.ink55}>{wallet?.cluster ?? '—'}</Text>}
            height={SETTING_ROW}
          />
          <Row
            title="Recovery"
            value={
              <Text variant="rowPrimary" color={recoveryBackedUp ? colors.ink55 : colors.warn}>
                {recoveryBackedUp ? 'Acknowledged' : 'Read this'}
              </Text>
            }
            height={SETTING_ROW}
            onPress={() => router.push('/recovery')}
          />

          <Eyebrow small style={{ marginTop: space.s26 }}>
            What the bot may do
          </Eyebrow>
          {/*
            "Live · $1,600/day" for a wallet that has granted nothing.

            `cap` is the value the SLIDER is sitting on — a preference the user has not signed —
            and `stopped` is only true once a delegation exists and is revoked. So before any
            grant this section read "Status Live, Daily cap $1,600/day" under a heading that says
            "What the bot may do". The bot may do nothing; there is no permission. Same mistake as
            the two dashes on Safety, in the opposite direction: there it said too little, here it
            claimed something that was not true.
          */}
          <Row
            title="Status"
            value={
              <Text
                variant="rowPrimary"
                color={!delegation ? colors.ink55 : stopped ? colors.ink55 : colors.up}
              >
                {!delegation ? 'Not granted' : stopped ? 'Stopped' : 'Live'}
              </Text>
            }
            height={SETTING_ROW}
            onPress={() => router.push('/safety')}
          />
          <Row
            title="Daily cap"
            value={
              delegation ? (
                <Price color={colors.ink55}>{capLabel(cap)}</Price>
              ) : (
                <Text variant="rowPrimary" color={colors.ink38}>
                  —
                </Text>
              )
            }
            height={SETTING_ROW}
          />
          <Row
            title="Withdrawal allowlist"
            value={
              <Text variant="rowPrimary" color={colors.ink55}>
                {addresses.length === 1 ? '1 address' : `${addresses.length} addresses`}
              </Text>
            }
            height={SETTING_ROW}
            onPress={() => router.push('/allowlist')}
          />

          <Eyebrow small style={{ marginTop: space.s26 }}>
            How the bot talks
          </Eyebrow>
          <SheetCard
            borderRadius={radius.panel}
            padding={space.s16}
            style={{ marginTop: space.s10 }}
          >
            <Segmented
              options={TONE_OPTIONS}
              value={tone}
              onChange={setTone}
              height={size.segThumbSm}
            />
            <Text variant="secondarySm" color={colors.ink45} style={{ marginTop: space.s12 }}>
              {TONES.find((t) => t.id === tone)?.description}
            </Text>
            <Text variant="footnote" color={colors.ink28} style={{ marginTop: space.s10 }}>
              This changes how the bot writes, never what it reports. Prices, sizes and
              limits read the same on every setting.
            </Text>
          </SheetCard>

          <Eyebrow small style={{ marginTop: space.s26 }}>
            Alerts
          </Eyebrow>
          <Row
            title="Notifications"
            value={<Text variant="rowPrimary" color={colors.ink55}>Manage</Text>}
            height={SETTING_ROW}
            onPress={() => router.push('/alerts')}
          />

          <Eyebrow small style={{ marginTop: space.s26 }}>
            Legal
          </Eyebrow>
          <Row title="Terms" height={SETTING_ROW} onPress={() => router.push('/legal/terms')} />
          <Row
            title="Privacy policy"
            height={SETTING_ROW}
            onPress={() => router.push('/legal/privacy')}
          />
          <Row
            title="Risk disclosure"
            height={SETTING_ROW}
            divider={false}
            onPress={() => router.push('/legal/risk')}
          />
          <View style={{ height: space.s30 }} />
        </ScrollView>
      </Fill>
    </Screen>
  );
}
