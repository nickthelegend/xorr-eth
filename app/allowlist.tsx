/**
 * Withdrawal allowlist — PLAN.md 10.6 / 12.21 [G31].
 * Screen 20 shows "2 addresses" with nothing behind it. Adding one starts a cooling-off period,
 * so an attacker who gets the phone still cannot move funds today.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, IconButton, Row, Screen, ScreenHeader } from '@/design/components';
import { ink, pnl } from '@/design/colors';
import { type } from '@/design/type';
import { COOLING_OFF_HOURS, useAllowlist } from '@/wallet/allowlist';

export default function Allowlist() {
  const router = useRouter();
  const { addresses, pendingFor } = useAllowlist();

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
            <Text style={[type.screenTitle, { color: ink.full }]}>Allowlist</Text>
          </View>
        }
      />

      <Text style={[type.secondary, { color: ink.i40, marginTop: 10 }]}>
        The only addresses funds can leave to. A new one becomes usable {COOLING_OFF_HOURS} hours
        after you add it.
      </Text>

      <Screen.Content style={{ marginTop: 20 }}>
        {addresses.map((a) => {
          const pending = pendingFor(a);
          return (
            <Row
              key={a.address}
              primary={a.label}
              secondary={a.address}
              value={pending ? 'Pending' : 'Active'}
              valueColor={pending ? pnl.warn : pnl.up}
              height={68}
            />
          );
        })}
      </Screen.Content>

      <Button label="Add an address" variant="ghost" />
    </Screen>
  );
}
