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
import { delegateUnusable, killCta, killExplanation, killTitle } from '@/state/derived';
import { useStore } from '@/state/store';
import { useAllowlist } from '@/wallet/allowlist';
import { useApprovals } from '@/wallet/useApprovals';
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

  /*
   * A granted permission the bot cannot actually use.
   *
   * Not revoked, not expired, cap intact — and inert, because it names a delegate key the
   * executor is not. The screen reported LIVE through exactly this, so it gets its own state
   * rather than being folded into either of the two that already existed.
   */
  const unusable = delegateUnusable(delegation, killed);

  // "2 addresses" was typed in. The allowlist is real and persisted; read it.
  const { addresses } = useAllowlist();

  /*
   * The second lock, read from the party that enforces it.
   *
   * `XorrDelegation` bounds the BOT and is enforced by a contract. It says nothing about what
   * this wallet may be asked to sign, so a compromised bundle could still put a transfer to an
   * attacker in front of the user and the delegation would not care — it governs the delegate.
   * Privy holds the key and refuses anything outside its policy before a signature exists.
   */
  const privy = useAsync(() => repos.wallet.privyPolicy(), []);

  /*
   * The standing allowances, which survive a revoke.
   *
   * Stopping the agents revokes the DELEGATION, and `spend` checks that before moving anything —
   * so the bot is genuinely stopped. The ERC-20 approvals are a separate grant to the same
   * contract and are untouched by it. On the screen where someone goes to disengage, showing one
   * and not the other means "I revoked everything" is true only of the half they can see.
   */
  const { approvals, revoke: revokeApproval, revoking } = useApprovals();

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
          promptMessage: unusable
            ? 'Reconnect your agents'
            : killed
              ? 'Resume your agents'
              : 'Stop all agents',
        });
        if (!res.success) {
          setLocalError('Not confirmed — nothing changed.');
          return;
        }
      }
      /*
       * A disconnected permission is re-granted, not revoked.
       *
       * `unusable` means the grant names a key the executor does not hold. Revoking it — which is
       * what "not killed, so the button stops things" used to do — would take the user from a
       * permission that does not work to no permission at all, and call that progress.
       */
      if (killed || unusable) await signGrant(cap, 86_400_000);
      else await signRevoke();
      setDelegation(await repos.wallet.delegation());
      setKilled(unusable ? false : !killed);
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
            backgroundColor: unusable ? colors.down : killed ? colors.ink30 : colors.up,
          }}
        />
        <Text variant="tagSm" color={unusable ? colors.down : killed ? colors.ink55 : colors.up}>
          {unusable ? 'Disconnected' : killed ? 'Stopped' : 'Live'}
        </Text>
      </View>

      <Text variant="onboardingTitle" style={{ marginTop: space.s16 }}>
        {killTitle(killed, unusable)}
      </Text>
      <Text variant="body" color={colors.ink40} style={{ marginTop: space.s8 }}>
        {killExplanation(killed, hiredCount, unusable)}
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

        {/*
          Both locks, named, on the screen whose subject is who may do what.

          Showing only the on-chain one understates the protection; claiming "defence in depth"
          without showing the second layer is the kind of unfalsifiable assertion this whole
          product argues against. So the policy is read back from Privy and its destinations are
          listed — and when it is not attached to this wallet, that says so, because Privy makes
          the wallet's OWNER authorise the attachment and for an embedded wallet that owner is the
          user. "This control belongs to you, not to us" is a better fact than a green tick.
        */}
        {privy.data ? (
          <SheetCard borderRadius={radius.panel} padding={space.s16} style={{ marginTop: space.s10 }}>
            <View style={{ gap: space.s6 }}>
              <Eyebrow small>Privy policy</Eyebrow>
              <Text variant="rowPrimary">
                {privy.data.enforced
                  ? 'Your wallet can only send to these'
                  : 'Ready, and yours to switch on'}
              </Text>
              <Text variant="footnote" color={colors.ink32}>
                {privy.data.enforced
                  ? 'Privy holds the key and refuses anything else before a signature exists — even if this app asks.'
                  : 'Privy makes the wallet’s owner authorise this, and that owner is you. Nothing we hold can attach it for you.'}
              </Text>
            </View>
            <View style={{ gap: space.s4, marginTop: space.s12 }}>
              {(privy.data.enforced ? privy.data.allowed : privy.data.wouldAllow).map((d) => (
                <View
                  key={d.address}
                  style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.s10 }}
                >
                  <Text variant="footnote" color={colors.ink55} style={{ flexShrink: 1 }}>
                    {d.label}
                  </Text>
                  <Text variant="footnote" color={colors.ink32}>
                    {d.address.slice(0, 6)}…{d.address.slice(-4)}
                  </Text>
                </View>
              ))}
            </View>
            {privy.data.ownedByQuorum ? (
              <Text variant="footnote" color={colors.ink32} style={{ marginTop: space.s12 }}>
                Owned by key quorum {privy.data.ownedByQuorum} — this server cannot widen it. Check
                it on ›
              </Text>
            ) : null}
            <Button
              label="Check it yourself"
              variant="ghost"
              onPress={() => router.push('/judge')}
              style={{ marginTop: space.s10 }}
            />
          </SheetCard>
        ) : null}

        {/*
          What the contract can still pull, and the button that takes it back.

          Only rendered when something is actually approved: four zero rows on a fresh wallet is
          noise on a screen that has to be scannable in a second.
        */}
        {approvals && approvals.tokens.some((t) => !t.none) ? (
          <SheetCard borderRadius={radius.panel} padding={space.s16} style={{ marginTop: space.s10 }}>
            <View style={{ gap: space.s6 }}>
              <Eyebrow small>Token approvals</Eyebrow>
              <Text variant="rowPrimary">What the contract can still pull</Text>
              <Text variant="footnote" color={colors.ink32}>
                Separate from the permission above, and they outlive it. Stopping your agents does
                not remove them — the bot cannot use them while it is stopped, but they stay until
                you take them back.
              </Text>
            </View>
            <View style={{ gap: space.s10, marginTop: space.s12 }}>
              {approvals.tokens
                .filter((t) => !t.none)
                .map((t) => (
                  <View
                    key={t.address}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: space.s10,
                    }}
                  >
                    <View style={{ flexShrink: 1 }}>
                      <Text variant="rowPrimary">{t.symbol}</Text>
                      <Text variant="footnote" color={colors.ink32}>
                        {t.unlimited ? 'No limit' : 'Limited'}
                      </Text>
                    </View>
                    <Button
                      label={revoking === t.symbol ? 'Taking it back…' : 'Take it back'}
                      variant="ghost"
                      loading={revoking === t.symbol}
                      onPress={() => revokeApproval(t, approvals.spender)}
                    />
                  </View>
                ))}
            </View>
          </SheetCard>
        ) : null}

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
        label={killCta(killed, unusable)}
        variant={killed || unusable ? 'primary' : 'destructive'}
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
