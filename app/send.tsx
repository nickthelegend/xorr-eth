/**
 * Send / withdraw — PLAN.md 10.6 [G14].
 *
 * PLAN.md §3.4: withdrawals may go ONLY to a user-allowlisted destination. This screen cannot
 * enter a free-form address on purpose — that constraint is the product, not a limitation.
 */
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, IconButton, NoteStrip, Row, Screen, ScreenHeader } from '@/design/components';
import { borders, ink, surfaces } from '@/design/colors';
import { hairlineWidth, radius } from '@/design/space';
import { type } from '@/design/type';
import { money } from '@/format';
import { useAllowlist } from '@/wallet/allowlist';

export default function Send() {
  const router = useRouter();
  const { addresses } = useAllowlist();
  const [selected, setSelected] = useState(0);

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
            <Text style={[type.screenTitle, { color: ink.full }]}>Send</Text>
          </View>
        }
      />

      <Text style={[type.secondary, { color: ink.i40, marginTop: 10 }]}>
        Funds can only leave to an address you have already allowlisted. That is what stops a
        compromised phone from draining the wallet.
      </Text>

      <Screen.Content style={{ marginTop: 22 }}>
        <Text style={[type.eyebrowSm, { color: ink.i32 }]}>Destination</Text>
        <View style={{ gap: 10, marginTop: 12 }}>
          {addresses.map((a, i) => (
            <Pressable
              key={a.address}
              onPress={() => setSelected(i)}
              accessibilityRole="radio"
              accessibilityState={{ selected: i === selected }}
              accessibilityLabel={a.label}
              style={{
                backgroundColor: surfaces.surface,
                borderRadius: radius.xl,
                padding: 16,
                borderWidth: i === selected ? 1 : hairlineWidth,
                borderColor: i === selected ? borders.selected : borders.card,
                gap: 4,
              }}
            >
              <Text style={[type.rowPrimary, { color: ink.full }]}>{a.label}</Text>
              <Text style={[type.secondary, { color: ink.i38 }]} numberOfLines={1}>
                {a.address}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={{ marginTop: 20 }}>
          <Row primary="Amount" value={money(0)} height={54} />
          <Row primary="Network fee" value="~$0.001" valueColor={ink.i55} height={54} divider={false} />
        </View>

        <NoteStrip kind="risk" style={{ marginTop: 16 }}>
          A new address takes effect after a cooling-off period. Adding one now does not let you
          send to it today.
        </NoteStrip>
      </Screen.Content>

      <Button
        label="Manage allowlist"
        variant="ghost"
        onPress={() => router.push('/allowlist')}
        style={{ marginBottom: 10 }}
      />
      <Button label="Review withdrawal" disabled />
    </Screen>
  );
}
