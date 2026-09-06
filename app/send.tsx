/**
 * Send / withdraw — PLAN.md 10.6 [G14].
 *
 * PLAN.md §3.4: withdrawals may go ONLY to a user-allowlisted destination. This screen cannot
 * enter a free-form address on purpose — that constraint is the product, not a limitation.
 *
 * It used to say withdrawals were "not enabled in this build", for two reasons, one of which was
 * wrong: that the executor has no transfer-out path (true, and deliberate — an executor that can
 * move funds out is a custodian) and that "the wallet is a devnet wallet whose key the executor
 * holds" (false since the Privy pivot, and the opposite of the product's central claim).
 *
 * The withdrawal was never the executor's to make. The owner signs it with their own embedded
 * wallet, the same way they sign the grant, and `useWithdraw` refuses anything not on the
 * allowlist or still inside its cooling-off period before a signature is requested.
 */
import React, { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Button,
  Eyebrow,
  Fill,
  IconButton,
  NoteStrip,
  Price,
  RadioCard,
  Screen,
  Text,
  border,
  colors,
  money,
  radius,
  space,
  typeScale,
} from '@/ui';
import { useAllowlist } from '@/wallet/allowlist';
import { useWithdraw } from '@/wallet/useWithdraw';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import { api } from '@/data/api';
import type { Address } from 'viem';

const FIELD_H = 52;

export default function Send() {
  const router = useRouter();
  const { addresses, pendingFor } = useAllowlist();
  const [selected, setSelected] = useState(0);
  const [amount, setAmount] = useState('');
  const { withdraw, busy, error, txHash } = useWithdraw();

  const balance = useAsync(() => repos.portfolio.balance(), []);
  // The settlement token for whichever chain this deployment settles on — asked, never assumed.
  const params = useAsync(
    () => api.get<{ token: Address; chain: string }>('/delegation/params'),
    [],
  );

  const cash = balance.data?.cash ?? null;
  const entry = addresses[selected];
  const amountUsd = Number(amount);
  const overBalance = cash !== null && amountUsd > cash;

  const problem = useMemo(() => {
    if (addresses.length === 0) return 'Add a destination to your allowlist first.';
    if (!entry) return 'Choose a destination.';
    if (pendingFor(entry)) return 'That address is still cooling off.';
    if (!amount) return undefined;
    if (!(amountUsd > 0)) return 'Enter an amount above zero.';
    if (overBalance) return 'That is more than your spendable cash.';
    return undefined;
  }, [addresses.length, entry, pendingFor, amount, amountUsd, overBalance]);

  const ready = Boolean(entry) && !pendingFor(entry!) && amountUsd > 0 && !overBalance && !!params.data;

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
        Funds can only leave to an address you have already allowlisted. That is what stops a
        compromised phone from draining the wallet.
      </Text>

      <Fill style={{ marginTop: space.s22 }}>
        <Eyebrow small>Destination</Eyebrow>
        <View style={{ gap: space.s10, marginTop: space.s12 }}>
          {addresses.length === 0 ? (
            <Text variant="secondary" color={colors.ink40}>
              Nothing on your allowlist yet.
            </Text>
          ) : (
            addresses.map((a, i) => (
              <RadioCard
                key={a.address}
                title={a.label}
                detail={a.address}
                tag={pendingFor(a) ? 'Pending' : undefined}
                selected={i === selected}
                onPress={() => setSelected(i)}
                showRadio={false}
              />
            ))
          )}
        </View>

        <View style={{ marginTop: space.s22 }}>
          <Eyebrow small>Amount</Eyebrow>
          <View
            style={{
              height: FIELD_H,
              borderRadius: radius.card,
              ...border.input,
              backgroundColor: colors.surfaceAlt,
              justifyContent: 'center',
              paddingHorizontal: space.s14,
              marginTop: space.s10,
            }}
          >
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              placeholderTextColor={colors.ink30}
              keyboardType="decimal-pad"
              inputMode="decimal"
              accessibilityLabel="Amount in USDC"
              style={[typeScale.amountMd, { color: colors.ink, padding: 0 }]}
            />
          </View>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              marginTop: space.s8,
            }}
          >
            <Text variant="footnote" color={colors.ink40}>
              Spendable cash
            </Text>
            {/* A dash, never a confident $0.00, when the balance could not be read. */}
            <Price variant="footnote">{cash === null ? '—' : money(cash)}</Price>
          </View>
        </View>

        <NoteStrip kind="risk" style={{ marginTop: space.s16 }}>
          A new address takes effect after a cooling-off period. Adding one now does not let you
          send to it today.
        </NoteStrip>

        {problem ? (
          <Text variant="secondary" color={colors.down} style={{ marginTop: space.s12 }}>
            {problem}
          </Text>
        ) : null}
        {error ? (
          <Text variant="secondary" color={colors.down} style={{ marginTop: space.s12 }}>
            {error}
          </Text>
        ) : null}
        {txHash ? (
          <NoteStrip kind="acted" style={{ marginTop: space.s12 }}>
            Sent. {txHash.slice(0, 10)}…{txHash.slice(-8)}
          </NoteStrip>
        ) : null}
      </Fill>

      <Button
        label="Manage allowlist"
        variant="ghost"
        onPress={() => router.push('/allowlist')}
        style={{ marginBottom: space.s10 }}
      />
      <Button
        label={busy ? 'Signing…' : 'Send'}
        disabled={!ready || busy}
        onPress={() => {
          void withdraw({
            token: params.data!.token,
            entry,
            allowlist: addresses,
            amountUsd,
          }).catch(() => undefined);
        }}
      />
      <Text
        variant="footnote"
        color={colors.ink28}
        align="center"
        style={{ marginTop: space.s12 }}
      >
        You sign this yourself. The bot has no power to move funds off this wallet.
      </Text>
    </Screen>
  );
}
