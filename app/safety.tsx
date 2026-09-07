/**
 * Screen 20 — Kill switch. screens.md Group C.
 *
 * A state chip (7pt dot + LIVE/STOPPED). State-driven title and explanation. Three
 * consequence cards. The two parties to the permission, named. Three settings rows. A 56pt
 * button — `candleDown` "Stop all agents" ↔ white "Resume agents".
 *
 * PLAN.md 6.10 / 12.5: this button SIGNS AN ON-CHAIN REVOKE, from the user's own wallet.
 * The footnote "Takes effect in under a second across every device" is true by construction,
 * because the authority is revoked at the chain rather than at a server we fan out from.
 */
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useGoBack } from '@/nav/useGoBack';
import * as LocalAuthentication from 'expo-local-authentication';
import {
  Button,
  ConsequenceCard,
  Eyebrow,
  Fill,
  IconButton,
  Press,
  Row,
  Screen,
  SheetCard,
  Text,
  colors,
  radius,
  size,
  space,
} from '@/ui';
import { killCta, killExplanation, killTitle } from '@/state/derived';
import { useStore } from '@/state/store';
import { useAllowlist } from '@/wallet/allowlist';
import { useGrantDelegation } from '@/auth/useGrantDelegation';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';

/** The state chip's dot. 7pt — screens.md gives this one exactly. */
const DOT = 7;
const SETTING_ROW = 52;

export default function Safety() {
  const router = useRouter();
  const goBack = useGoBack();
  // How many agents can actually place an order right now, from the server. Counting a
  // boolean in browser state would make the kill switch's own explanation a guess.
  const roster = useAsync(() => repos.bot.listAgents(), []);
  const hiredCount = (roster.data ?? []).filter((a) => a.hired).length;

  const killed = useStore((s) => s.killed);
  const setKilled = useStore((s) => s.setKilled);
  const setDelegation = useStore((s) => s.setDelegation);
  // Read it as well as write it: the two parties are rendered below, and a screen that
  // stores the delegation and then cannot see it is why they were never shown at all.
  const delegation = useStore((s) => s.delegation);
  const cap = useStore((s) => s.cap);
  const recoveryBackedUp = useStore((s) => s.recoveryBackedUp);
  const [localError, setLocalError] = useState<string>();

  // "2 addresses" was typed in. The allowlist is real and persisted; read it.
  const { addresses } = useAllowlist();

  /*
   * Load the permission when the screen opens.
   *
   * The store only ever held a delegation written by a grant or a revoke performed in this
   * session, so a user who simply navigated here saw nothing about the permission governing
   * their money right now. On a screen whose subject IS that permission, that is the wrong
   * default.
   */
  useEffect(() => {
    let alive = true;
    void repos.wallet
      .delegation()
      .then((d) => {
        if (alive) setDelegation(d);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [setDelegation]);

  // Signed by the user, on-chain. This is why "under a second across every device" is true
  // without any server needing to be reachable.
  const { grant: signGrant, revoke: signRevoke, busy, error: txError } = useGrantDelegation();
  const error = localError ?? txError;

  async function toggle() {
    setLocalError(undefined);
    try {
      // Biometrics gate every change to what the bot may do. PLAN.md 12.20.
      const hasHw = await LocalAuthentication.hasHardwareAsync().catch(() => false);
      const enrolled = hasHw
        ? await LocalAuthentication.isEnrolledAsync().catch(() => false)
        : false;
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s8 }}>
        <IconButton
          name="back"
          accessibilityLabel="Back"
          background="none"
          onPress={() => goBack()}
        />
        <Text variant="screenTitle">Safety</Text>
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.s8,
          alignSelf: 'flex-start',
          marginTop: space.s20,
          backgroundColor: colors.surfaceAlt,
          borderRadius: radius.card,
          paddingHorizontal: space.s12,
          paddingVertical: space.s6,
        }}
      >
        <View
          style={{
            width: DOT,
            height: DOT,
            borderRadius: radius.full,
            backgroundColor: killed ? colors.ink30 : colors.up,
          }}
        />
        <Text variant="tagSm" color={killed ? colors.ink55 : colors.up}>
          {killed ? 'Stopped' : 'Live'}
        </Text>
      </View>

      <Text variant="onboardingTitle" style={{ marginTop: space.s16 }}>
        {killTitle(killed)}
      </Text>
      <Text variant="body" color={colors.ink40} style={{ marginTop: space.s8 }}>
        {killExplanation(killed, hiredCount)}
      </Text>

      <Fill style={{ marginTop: space.s20 }}>
        <View style={{ gap: space.s10 }}>
          <ConsequenceCard tone="down" label="New orders" detail="Stopped immediately" />
          <ConsequenceCard
            tone="up"
            label="Stops and take-profits"
            detail="Stay active — your risk is still covered"
          />
          <ConsequenceCard tone="up" label="Open positions" detail="Left exactly as they are" />
        </View>

        {/*
          Name the two parties.
          This screen is entirely about who may do what with the user's money, and it never
          said who either party was. `Row` truncates a long value, and two addresses that
          differ only in the middle truncate identically — so the address is shown in full,
          small, and a Basename is used as the headline wherever one exists.
        */}
        <SheetCard borderRadius={radius.panel} padding={space.s16} style={{ marginTop: space.s18 }}>
          {/*
            No permission is a SENTENCE, not two dashes.

            Before a grant exists `/delegation` is null, so both rows rendered "—" on the one
            screen whose entire subject is who may do what with the user's money. Two blank
            fields under "Your wallet" and "The bot's key" read as the screen having failed to
            load, and the honest answer — nobody has been given anything yet — is also the
            reassuring one. It links to the grant, because that is what the reader will want next.
          */}
          {delegation ? (
            <>
              <Party
                label="Your wallet"
                name={delegation.ownerName}
                address={delegation.ownerPubkey}
              />
              <Party
                label="The bot's key"
                name={delegation.delegateName}
                address={delegation.delegatePubkey}
                note="Can trade inside your limits. Cannot withdraw, ever."
              />
            </>
          ) : (
            <View style={{ paddingVertical: space.s12, gap: space.s6 }}>
              <Eyebrow small>The permission</Eyebrow>
              <Text variant="rowPrimary">Nothing is granted yet</Text>
              <Text variant="footnote" color={colors.ink32}>
                No bot can touch this wallet until you sign a permission, and there is nothing to
                stop because nothing has started.
              </Text>
              <Button
                label="Set the limits"
                variant="ghost"
                onPress={() => router.push('/delegate')}
                style={{ marginTop: space.s10 }}
              />
            </View>
          )}
        </SheetCard>

        <SheetCard borderRadius={radius.panel} padding={space.s16} style={{ marginTop: space.s12 }}>
          <Row
            title="Face ID for every payout"
            value={<Text variant="rowPrimary" color={colors.ink55}>On</Text>}
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
          <Row
            title="Recovery"
            value={
              <Text variant="rowPrimary" color={recoveryBackedUp ? colors.ink55 : colors.warn}>
                {recoveryBackedUp ? 'Acknowledged' : 'Read this'}
              </Text>
            }
            height={SETTING_ROW}
            divider={false}
            onPress={() => router.push('/recovery')}
          />
        </SheetCard>

        {error ? (
          <Text variant="secondarySm" color={colors.down} style={{ marginTop: space.s14 }}>
            {error}
          </Text>
        ) : null}
      </Fill>

      <Button
        label={killCta(killed)}
        variant={killed ? 'primary' : 'destructive'}
        height={size.buttonLg}
        loading={busy}
        onPress={toggle}
      />
      <Text
        variant="footnote"
        color={colors.ink28}
        align="center"
        style={{ marginTop: space.s12 }}
      >
        Takes effect in under a second across every device.
      </Text>
      {/*
        Stopping and exiting are different needs, and only the first one was offered.
        Deliberately a quiet secondary link rather than a second big red button: two
        destructive buttons of equal weight is how someone taps the wrong one.
      */}
      <Press
        onPress={() => router.push('/flatten')}
        accessibilityRole="button"
        accessibilityLabel="Sell every position into USDC"
        hitHeight={size.hit}
        style={{ marginTop: space.s14, alignItems: 'center' }}
      >
        <Text variant="footnote" color={colors.ink45}>
          Stopping is not selling. Sell everything into cash ›
        </Text>
      </Press>
    </Screen>
  );
}

/**
 * One side of the permission: what it is called, and exactly which address it is.
 *
 * The address is rendered in full rather than truncated, because the reason to show it at
 * all is so a person can compare it with an explorer — and a truncation defeats that. A
 * Basename, when there is one, is the headline; the address stays underneath rather than
 * being replaced by it, since a name is a claim about an address and the app should not ask
 * anyone to take it on faith.
 */
function Party({
  label,
  name,
  address,
  note,
}: {
  label: string;
  name?: string | null;
  address?: string;
  note?: string;
}) {
  return (
    <View style={{ paddingVertical: space.s12, gap: space.s2 }}>
      <Eyebrow small>{label}</Eyebrow>
      <Text variant="rowPrimary">{name ?? (address ? 'No Basename' : '—')}</Text>
      {address ? (
        <Text variant="footnoteSm" color={colors.ink38} selectable>
          {address}
        </Text>
      ) : null}
      {note ? (
        <Text variant="footnote" color={colors.ink32} style={{ marginTop: space.s2 }}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}
