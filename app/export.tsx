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
 * Handed to the system share sheet rather than written to disk. A file the app saves somewhere only
 * it can see is not an export.
 */
import React, { useState } from 'react';
import { Share, View } from 'react-native';
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
} from '@/ui';
import { repos } from '@/data';

type Job = 'trail-csv' | 'trail-json' | 'disposals' | null;

export default function Export() {
  const goBack = useGoBack();
  const [busy, setBusy] = useState<Job>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const run = async (job: Exclude<Job, null>, get: () => Promise<string>) => {
    setBusy(job);
    setProblem(null);
    try {
      const body = await get();
      /*
       * The count, from the file itself. A share sheet gives no feedback about what it received,
       * and "exported" with nothing behind it is the kind of confirmation that hides an empty file.
       */
      const rows = Math.max(0, body.trim().split('\n').length - 1);
      await Share.share({ message: body, title: job });
      setProblem(rows === 0 ? 'That file came back empty — there is nothing to export yet.' : null);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <HeaderBar onBack={goBack} title={<Text variant="screenTitle">Export</Text>} />

      <Fill style={{ marginTop: space.s20, gap: space.s12 }}>
        <SheetCard bordered borderRadius={radius.panel} padding={space.s16}>
          <Text variant="rowPrimary">The audit trail</Text>
          <Text variant="secondarySm" color={colors.ink40} style={{ marginTop: space.s8 }}>
            Every action and every non-action, hash-chained, in the order they happened. This is what
            the bot did — including what it refused to do.
          </Text>
          <View style={{ flexDirection: 'row', gap: space.s10, marginTop: space.s14 }}>
            <Button
              label={busy === 'trail-csv' ? 'Preparing…' : 'CSV'}
              variant="ghost"
              disabled={busy !== null}
              style={{ flex: 1 }}
              onPress={() => run('trail-csv', () => repos.activity.exportTrail('csv'))}
            />
            <Button
              label={busy === 'trail-json' ? 'Preparing…' : 'JSON'}
              variant="ghost"
              disabled={busy !== null}
              style={{ flex: 1 }}
              onPress={() => run('trail-json', () => repos.activity.exportTrail('json'))}
            />
          </View>
        </SheetCard>

        <SheetCard bordered borderRadius={radius.panel} padding={space.s16}>
          <Text variant="rowPrimary">Disposals</Text>
          <Text variant="secondarySm" color={colors.ink40} style={{ marginTop: space.s8 }}>
            One row per sale with the cost it was matched against. A different document from the
            trail, and the one an accountant actually wants.
          </Text>
          <Button
            label={busy === 'disposals' ? 'Preparing…' : 'CSV'}
            variant="ghost"
            disabled={busy !== null}
            style={{ marginTop: space.s14 }}
            onPress={() => run('disposals', () => repos.activity.exportDisposals())}
          />
        </SheetCard>

        {problem ? (
          <Text variant="secondarySm" color={colors.warn}>
            {problem}
          </Text>
        ) : null}

        <Text variant="footnote" color={colors.ink28}>
          Some sales have no recorded cost, and the disposals file marks those rather than quietly
          understating the gain.
        </Text>
      </Fill>
    </Screen>
  );
}
