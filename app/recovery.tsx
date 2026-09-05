/**
 * Recovery backup — PLAN.md 10.8 [G31].
 *
 * Screen 20 shows "Not backed up" in `warn` with nowhere to go. After the pivot this is not a
 * nicety: NON-CUSTODIAL MEANS LOSING THE KEY LOSES THE FUNDS. The screen says so in those words.
 */
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, IconButton, NoteStrip, Screen, ScreenHeader, SheetCard } from '@/design/components';
import { ink, pnl, surfaces } from '@/design/colors';
import { radius } from '@/design/space';
import { type } from '@/design/type';

export default function Recovery() {
  const router = useRouter();
  const [revealed, setRevealed] = useState(false);

  return (
    <Screen>
      <ScreenHeader
        left={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <IconButton
              name="back"
              accessibilityLabel="Back"
              background="transparent"
              color={ink.i55}
              onPress={() => router.back()}
            />
            <Text style={[type.screenTitle, { color: ink.full }]}>Recovery</Text>
          </View>
        }
      />

      <Text style={[type.onboardingTitle, { color: ink.full, marginTop: 20 }]}>
        Back this up now
      </Text>
      <Text style={[type.body, { color: ink.i40, marginTop: 10 }]}>
        xorr does not hold your keys, which means xorr cannot recover them. If you lose this device
        and have no backup, the funds in this wallet are gone. There is no support line for that.
      </Text>

      <Screen.Content style={{ marginTop: 22 }}>
        <SheetCard radius={radius.xl} padding={18}>
          <Text style={[type.eyebrowSm, { color: ink.i32 }]}>Recovery phrase</Text>
          <View
            style={{
              marginTop: 14,
              minHeight: 120,
              borderRadius: radius.md2,
              backgroundColor: surfaces.surfaceAlt,
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
          >
            <Text style={[type.body, { color: ink.i40, textAlign: 'center' }]}>
              {revealed
                ? 'Your phrase is shown on the device only. Write it down on paper; do not screenshot it.'
                : 'Hidden. Reveal it somewhere nobody can see your screen.'}
            </Text>
          </View>
          <Button
            label={revealed ? 'Hide' : 'Reveal phrase'}
            variant="secondary"
            height={46}
            style={{ marginTop: 14 }}
            onPress={() => setRevealed((r) => !r)}
          />
        </SheetCard>

        <NoteStrip kind="blocked" style={{ marginTop: 16 }}>
          Anyone who reads this phrase can take everything in the wallet. Never type it into a
          website, a message, or a support chat.
        </NoteStrip>
      </Screen.Content>

      <Button label="I have written it down" onPress={() => router.back()} />
      <Text style={[type.footnote, { color: pnl.warn, textAlign: 'center', marginTop: 12 }]}>
        Until you do this, the wallet has a single point of failure.
      </Text>
    </Screen>
  );
}
