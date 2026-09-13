/**
 * The two files an accountant asks for, out of the app.
 *
 * Both exports have existed on the executor since the audit trail did — and the only way to get one
 * was a bearer token and curl. "The trail is the compliance artifact" is not much of a claim if the
 * person it belongs to cannot obtain it.
 *
 * They are genuinely different documents and the screen says which is which. The audit trail is
 * what the bot DID, including the refusals; disposals are cost basis on what was sold. One file
 * trying to be both would be the wrong shape for each.
 *
 * Delivery is `deliverFile`, which downloads in a browser and shares on a phone. It used to call
 * `Share.share` on both, and Chrome rejects that outright — the screen said "Permission denied" and
 * produced nothing, which on a screen whose whole purpose is producing a file is a total failure
 * wearing a handled error's clothes.
 *
 * Distilled 2026-09-14 (PLAN.md O3). Signed out there is no trail to export, so the buttons give way to a sign-in.
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { useGoBack } from '@/nav/useGoBack';
import {
  Button,
  Fill,
  HeaderBar,
  Screen,
  SheetCard,
  Text,
  colors,
  radius,
  space,
  SignInPrompt,
} from '@/ui';
import { useSignedOut } from '@/auth/useSignedOut';
import { repos } from '@/data';
import { deliverFile } from '@/export/deliver';
import { errorText } from '@/data/apiError';

type Job = 'trail-csv' | 'trail-json' | 'disposals' | null;

export default function Export() {
  const goBack = useGoBack();
  const [busy, setBusy] = useState<Job>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /* What actually left, so a silent download is not indistinguishable from a dead button. */
  const [done, setDone] = useState<string | null>(null);
  const signedOut = useSignedOut();

  const run = async (job: Exclude<Job, null>, filename: string, get: () => Promise<string>) => {
    setBusy(job);
    setProblem(null);
    setDone(null);
    try {
      const body = await get();
      /*
       * The count, from the file itself. Neither a download nor a share sheet reports what it
       * received, and "exported" with nothing behind it is the confirmation that hides an empty
       * file.
       */
      const rows = Math.max(0, body.trim().split('\n').length - 1);
      if (rows === 0) {
        setProblem('Nothing to export yet.');
        return;
      }
      const out = await deliverFile(filename, body, filename.endsWith('.json') ? 'application/json' : 'text/csv');
      if (out.ok) setDone(`${rows} rows · ${filename}`);
      else setProblem(out.reason);
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <HeaderBar onBack={goBack} title={<Text variant="screenTitle">Export</Text>} />

      {signedOut ? (
        <SignInPrompt />
      ) : (
        <Fill style={{ marginTop: space.s20, gap: space.s12 }}>
          <SheetCard bordered borderRadius={radius.panel} padding={space.s16}>
            <Text variant="rowPrimary">The audit trail</Text>
            <Text variant="secondarySm" color={colors.ink55} style={{ marginTop: space.s8 }}>
              Everything the bot did and refused, in order.
            </Text>
            <View style={{ flexDirection: 'row', gap: space.s10, marginTop: space.s14 }}>
              <Button
                label={busy === 'trail-csv' ? 'Preparing…' : 'CSV'}
                variant="ghost"
                disabled={busy !== null}
                style={{ flex: 1 }}
                onPress={() => run('trail-csv', 'xorr-audit.csv', () => repos.activity.exportTrail('csv'))}
              />
              <Button
                label={busy === 'trail-json' ? 'Preparing…' : 'JSON'}
                variant="ghost"
                disabled={busy !== null}
                style={{ flex: 1 }}
                onPress={() => run('trail-json', 'xorr-audit.json', () => repos.activity.exportTrail('json'))}
              />
            </View>
          </SheetCard>

          <SheetCard bordered borderRadius={radius.panel} padding={space.s16}>
            <Text variant="rowPrimary">Disposals</Text>
            <Text variant="secondarySm" color={colors.ink55} style={{ marginTop: space.s8 }}>
              Each sale with the cost it was matched against.
            </Text>
            <Button
              label={busy === 'disposals' ? 'Preparing…' : 'CSV'}
              variant="ghost"
              disabled={busy !== null}
              style={{ marginTop: space.s14 }}
              onPress={() => run('disposals', 'xorr-disposals.csv', () => repos.activity.exportDisposals())}
            />
          </SheetCard>

          {problem ? (
            <Text variant="secondarySm" color={colors.warn}>
              {problem}
            </Text>
          ) : done ? (
            <Text variant="secondarySm" color={colors.up}>
              {done}
            </Text>
          ) : null}

          <Text variant="footnote" color={colors.ink55}>
            A sale with no recorded cost is marked, not guessed.
          </Text>
        </Fill>
      )}
    </Screen>
  );
}
