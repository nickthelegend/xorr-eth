/**
 * Recovery — PLAN.md 10.8, 4.10; distilled 2026-09-14.
 *
 * The login is the recovery: the same email on any device reaches the same wallet, and xorr never holds its key. Where
 * a copy of the key can be had — Privy's export window on the web — the screen offers it; a phone says where to go.
 * It once told a user their wallet was shared with the executor, which was never true; it now says only what is.
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { useGoBack } from '@/nav/useGoBack';
import { BackButton, Button, Fill, Screen, Text, colors, space } from '@/ui';
import { useStore } from '@/state/store';
import { useKeyExport } from '@/wallet/useKeyExport';
import { errorText } from '@/data/apiError';

export default function Recovery() {
  const goBack = useGoBack();
  const wallet = useStore((s) => s.wallet);
  const setRecoveryBackedUp = useStore((s) => s.setRecoveryBackedUp);
  const acknowledged = useStore((s) => s.recoveryBackedUp);
  const keyExport = useKeyExport(wallet?.address);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string>();

  async function exportKey() {
    if (!keyExport.supported || exporting) return;
    setExportError(undefined);
    setExporting(true);
    try {
      await keyExport.exportKey();
    } catch (e) {
      setExportError(errorText(e));
    } finally {
      setExporting(false);
    }
  }

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s8 }}>
        <BackButton onPress={() => goBack()} />
        <Text variant="screenTitle">Recovery</Text>
      </View>

      <Text variant="onboardingTitle" style={{ marginTop: space.s20 }}>
        Your email is the way back
      </Text>
      <Text variant="body" color={colors.ink55} style={{ marginTop: space.s10 }}>
        Sign in with it on any device to open this wallet.
      </Text>

      <Fill style={{ marginTop: space.s26 }}>
        {keyExport.supported ? (
          <>
            <Button label="Export private key" variant="secondary" loading={exporting} onPress={exportKey} />
            <Text variant="footnote" color={colors.ink55} align="center" style={{ marginTop: space.s10 }}>
              Shown in a secure window. xorr never sees it.
            </Text>
          </>
        ) : (
          <Text variant="footnote" color={colors.ink55}>
            {keyExport.reason}
          </Text>
        )}
        {exportError ? (
          <Text variant="footnote" color={colors.down} style={{ marginTop: space.s10 }}>
            {exportError}
          </Text>
        ) : null}
      </Fill>

      <Button
        label={acknowledged ? 'Done' : 'Got it'}
        onPress={() => {
          setRecoveryBackedUp(true);
          goBack();
        }}
      />
    </Screen>
  );
}
