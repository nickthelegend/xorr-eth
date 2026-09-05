/**
 * Sign in and get a wallet — Privy.
 *
 * Replaces the handoff's KYC screen (screen 8). Its LAYOUT is reused verbatim — the progress
 * header and four 66px status rows, with the same three circle states — because that pattern
 * reads correctly for any sequential setup. Only the steps change.
 *
 * The product point: identity and wallet are one object. The user signs in with an email code and
 * comes out the other side owning a wallet xorr cannot spend from. The bot's authority over it is
 * a separate on-chain permission, granted on the next screen.
 */
import React, { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '@/design/Icon';
import { Button, NoteStrip, Progress, Screen } from '@/design/components';
import { borders, ink, pnl, surfaces } from '@/design/colors';
import { hairlineWidth, radius } from '@/design/space';
import { type } from '@/design/type';
import { repos } from '@/data';
import { useStore } from '@/state/store';
import { useAuth, useEmailLogin } from '@/auth/useAuth';

const STEPS = [
  { label: 'Signed in', detail: 'An email code, no password to lose' },
  { label: 'Wallet created', detail: 'Keys are yours, held on your device' },
  { label: 'Network ready', detail: 'Connected to Base' },
  { label: 'Ready to fund', detail: 'Nothing is deposited yet' },
] as const;

export default function WalletSetup() {
  const router = useRouter();
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

  // Once Privy has an address, register it with the executor so the bot knows whose wallet it is.
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
      <Progress step={2} total={3} onBack={() => router.back()} />

      <Text style={[type.onboardingTitle, { color: ink.full, marginTop: 26 }]}>
        Your wallet, your keys
      </Text>
      <Text style={[type.body, { color: ink.i40, marginTop: 10 }]}>
        xorr never holds your money. You keep the wallet; the bot gets a separate, limited
        permission to trade inside it — which you can take back at any time.
      </Text>

      <Screen.Content style={{ marginTop: 22 }}>
        {STEPS.map((s, i) => {
          const isDone = i < step;
          const isCurrent = i === step;
          return (
            <View
              key={s.label}
              style={{ height: 62, flexDirection: 'row', alignItems: 'center', gap: 14 }}
            >
              <View
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isDone ? pnl.up : 'transparent',
                  borderWidth: isDone ? 0 : 2,
                  borderColor: isCurrent ? ink.full : borders.pending,
                }}
              >
                {isDone ? <Icon name="check" size={14} color={pnl.upInk} strokeWidth={2.4} /> : null}
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text
                  style={[type.rowPrimary, { color: isDone || isCurrent ? ink.full : ink.i32 }]}
                >
                  {s.label}
                </Text>
                <Text style={[type.secondary, { color: isDone || isCurrent ? ink.i38 : ink.i28 }]}>
                  {s.detail}
                </Text>
              </View>
            </View>
          );
        })}

        {!authenticated ? (
          <View style={{ gap: 10, marginTop: 8 }}>
            <Field
              label="Email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              editable={!codeSent}
              keyboard="email-address"
            />
            {codeSent ? (
              <Field label="Code" value={code} onChange={setCode} placeholder="6-digit code" keyboard="number-pad" />
            ) : null}
          </View>
        ) : null}

        <NoteStrip kind={authenticated ? 'acted' : 'risk'} style={{ marginTop: 16 }}>
          Losing this wallet means losing the funds in it. Back up the recovery method before you
          deposit anything.
        </NoteStrip>

        {error ? (
          <Text style={[type.noteBody, { color: pnl.down, marginTop: 14 }]}>{error}</Text>
        ) : null}
      </Screen.Content>

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
    <View style={{ gap: 8 }}>
      <Text style={[type.eyebrowSm, { color: ink.i32 }]}>{label}</Text>
      <View
        style={{
          height: 48,
          borderRadius: radius.md2,
          backgroundColor: surfaces.inputBg,
          borderWidth: hairlineWidth,
          borderColor: borders.input,
          paddingHorizontal: 14,
          justifyContent: 'center',
          opacity: editable ? 1 : 0.6,
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={ink.i35}
          editable={editable}
          autoCapitalize="none"
          keyboardType={keyboard}
          style={[type.body, { color: ink.full }]}
          accessibilityLabel={label}
        />
      </View>
    </View>
  );
}
