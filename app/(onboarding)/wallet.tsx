/**
 * NEW — Create or connect wallet. PLAN.md 7.3, REPLACING screen 8 (Verify identity).
 *
 * [G44] Screen 8 describes KYC for a custodial product that no longer exists. Its LAYOUT is
 * reused verbatim — the progress header and the four 66px status rows, with the same three circle
 * states (done = filled `up` with a check in upInk; current = 2px white ring; pending = 2px
 * rgba(255,255,255,.18) ring and dimmed text) — because that pattern reads correctly for any
 * sequential setup. Only the steps change.
 */
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '@/design/Icon';
import { Button, ButtonRow, NoteStrip, Progress, Screen } from '@/design/components';
import { borders, ink, pnl } from '@/design/colors';
import { type } from '@/design/type';
import { repos } from '@/data';
import { useStore } from '@/state/store';

const STEPS = [
  { label: 'Wallet created', detail: 'Keys live on this device' },
  { label: 'Recovery secured', detail: 'A passkey you already have' },
  { label: 'Network ready', detail: 'Connected to Solana' },
  { label: 'Ready to fund', detail: 'Nothing is deposited yet' },
] as const;

export default function WalletSetup() {
  const router = useRouter();
  const walletStep = useStore((s) => s.walletStep);
  const advance = useStore((s) => s.advanceWalletStep);
  const setWallet = useStore((s) => s.setWallet);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const done = walletStep >= STEPS.length;

  async function create() {
    setBusy(true);
    setError(undefined);
    try {
      const w = await repos.wallet.createEmbedded();
      setWallet(w);
      advance();
      advance();
      advance();
      advance();
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

      <Screen.Content style={{ marginTop: 24 }}>
        {STEPS.map((s, i) => {
          const isDone = i < walletStep;
          const isCurrent = i === walletStep;
          return (
            <View
              key={s.label}
              style={{ height: 66, flexDirection: 'row', alignItems: 'center', gap: 14 }}
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
                  style={[
                    type.rowPrimary,
                    { color: isDone || isCurrent ? ink.full : ink.i32 },
                  ]}
                >
                  {s.label}
                </Text>
                <Text
                  style={[type.secondary, { color: isDone || isCurrent ? ink.i38 : ink.i28 }]}
                >
                  {s.detail}
                </Text>
              </View>
            </View>
          );
        })}

        <NoteStrip kind="acted" style={{ marginTop: 16 }}>
          Losing this wallet means losing the funds in it. Back up the recovery method before you
          deposit anything.
        </NoteStrip>

        {error ? (
          <Text style={[type.noteBody, { color: pnl.down, marginTop: 14 }]}>{error}</Text>
        ) : null}
      </Screen.Content>

      {done ? (
        <Button label="Continue — add funds" onPress={() => router.push('/fund')} />
      ) : (
        <ButtonRow
          affirmativeFlex={1.3}
          secondary={
            <Button
              label="Connect existing"
              variant="secondary"
              onPress={() => router.push('/fund')}
            />
          }
          affirmative={<Button label="Create wallet" loading={busy} onPress={create} />}
        />
      )}
    </Screen>
  );
}
