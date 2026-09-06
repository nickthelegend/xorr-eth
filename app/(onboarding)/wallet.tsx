/**
 * Sign in and get a wallet — Privy.
 *
 * Replaces the handoff's KYC screen (screen 8). Its LAYOUT is reused verbatim — the progress
 * header and four status rows, with the same three circle states (done = filled `up` with a
 * check in `upInk`; current = 2pt white ring; pending = 2pt `pending` ring and dimmed text)
 * — because that pattern reads correctly for any sequential setup. Only the steps change.
 *
 * The product point: identity and wallet are one object. The user signs in with an email
 * code and comes out the other side owning a wallet xorr cannot spend from. The bot's
 * authority over it is a separate on-chain permission, granted on the next screen.
 */
import React, { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useGoBack } from '@/nav/useGoBack';
import { Icon } from '@/design/Icon';
import {
  Button,
  Eyebrow,
  Fill,
  NoteStrip,
  Progress,
  Screen,
  Text,
  border,
  colors,
  radius,
  space,
  typeScale,
} from '@/ui';
import { repos } from '@/data';
import { useStore } from '@/state/store';
import { useAuth, useEmailLogin } from '@/auth/useAuth';

const STEPS = [
  { label: 'Signed in', detail: 'An email code, no password to lose' },
  { label: 'Wallet created', detail: 'Keys are yours, held on your device' },
  { label: 'Network ready', detail: 'Connected to Base' },
  { label: 'Ready to fund', detail: 'Nothing is deposited yet' },
] as const;

/** The step marker. 26pt, 2pt ring — screens 8/9 draw it at this size on both. */
const MARK = 26;
const RING = 2;
const STEP_H = 62;
const FIELD_H = 48;

export default function WalletSetup() {
  const router = useRouter();
  const goBack = useGoBack();
  const { ready, authenticated, address, createWallet } = useAuth();
  const { sendCode, loginWithCode } = useEmailLogin();
  const setWallet = useStore((s) => s.setWallet);

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  // How far through setup the user is — derived, never a counter we increment by hand.
  const step = !authenticated ? 0 : !address ? 1 : 4;
  const done = step >= STEPS.length;

  // Once Privy has an address, register it with the executor so the bot knows whose wallet
  // it is.
  useEffect(() => {
    if (!address) return;
    repos.wallet
      .connect(address)
      .then((w) => setWallet(w))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [address, setWallet]);

  async function send() {
    setBusy(true);
    setError(undefined);
    try {
      await sendCode({ email: email.trim() });
      setCodeSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setError(undefined);
    try {
      await loginWithCode({ code: code.trim(), email: email.trim() });
      await createWallet();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Progress step={2} total={3} onBack={() => goBack()} />

      <Text variant="onboardingTitle" style={{ marginTop: space.s26 }}>
        Your wallet, your keys
      </Text>
      <Text variant="body" color={colors.ink40} style={{ marginTop: space.s10 }}>
        xorr never holds your money. You keep the wallet; the bot gets a separate, limited
        permission to trade inside it — which you can take back at any time.
      </Text>

      <Fill style={{ marginTop: space.s22 }}>
        {STEPS.map((s, i) => {
          const isDone = i < step;
          const isCurrent = i === step;
          return (
            <View
              key={s.label}
              style={{
                height: STEP_H,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.s14,
              }}
            >
              <View
                style={{
                  width: MARK,
                  height: MARK,
                  borderRadius: radius.full,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isDone ? colors.up : 'transparent',
                  borderWidth: isDone ? 0 : RING,
                  borderColor: isCurrent ? colors.ink : colors.pending,
                }}
              >
                {isDone ? (
                  <Icon name="check" size={14} color={colors.upInk} strokeWidth={2.4} />
                ) : null}
              </View>
              <View style={{ flex: 1, gap: space.s2 }}>
                <Text variant="rowPrimary" color={isDone || isCurrent ? colors.ink : colors.ink32}>
                  {s.label}
                </Text>
                <Text
                  variant="secondarySm"
                  color={isDone || isCurrent ? colors.ink38 : colors.ink28}
                >
                  {s.detail}
                </Text>
              </View>
            </View>
          );
        })}

        {!authenticated ? (
          <View style={{ gap: space.s10, marginTop: space.s8 }}>
            <Field
              label="Email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              editable={!codeSent}
              keyboard="email-address"
            />
            {codeSent ? (
              <Field
                label="Code"
                value={code}
                onChange={setCode}
                placeholder="6-digit code"
                keyboard="number-pad"
              />
            ) : null}
          </View>
        ) : null}

        <NoteStrip kind={authenticated ? 'acted' : 'risk'} style={{ marginTop: space.s16 }}>
          Losing this wallet means losing the funds in it. Back up the recovery method before
          you deposit anything.
        </NoteStrip>

        {error ? (
          <Text variant="secondarySm" color={colors.down} style={{ marginTop: space.s14 }}>
            {error}
          </Text>
        ) : null}
      </Fill>

      {done ? (
        <Button label="Continue — add funds" onPress={() => router.push('/fund')} />
      ) : !authenticated ? (
        <Button
          label={codeSent ? 'Verify and create wallet' : 'Email me a code'}
          loading={busy || !ready}
          disabled={codeSent ? code.trim().length < 4 : !email.includes('@')}
          onPress={codeSent ? verify : send}
        />
      ) : (
        <Button label="Create wallet" loading={busy} onPress={() => void createWallet()} />
      )}
    </Screen>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  editable = true,
  keyboard = 'default',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  editable?: boolean;
  keyboard?: 'default' | 'email-address' | 'number-pad';
}) {
  return (
    <View style={{ gap: space.s8 }}>
      <Eyebrow small>{label}</Eyebrow>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.ink35}
        editable={editable}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={keyboard}
        accessibilityLabel={label}
        style={[
          typeScale.body,
          border.input,
          {
            height: FIELD_H,
            borderRadius: radius.tile,
            backgroundColor: colors.inputBg,
            paddingHorizontal: space.s14,
            color: colors.ink,
            opacity: editable ? 1 : 0.6,
          },
        ]}
      />
    </View>
  );
}
