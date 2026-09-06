/**
 * Withdrawal allowlist — PLAN.md 10.6 / 12.21 [G31].
 *
 * Screen 20 shows "2 addresses" with nothing behind it. Adding one starts a cooling-off
 * period, so an attacker who gets the phone still cannot move funds today.
 *
 * "Add an address" had no `onPress`. It does now — the entry is validated as a Solana
 * address, persisted, and starts its cooling-off clock, which is what makes the "Pending"
 * state on the row below mean something.
 */
import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Button,
  Fill,
  IconButton,
  Price,
  Row,
  Screen,
  SheetCard,
  Text,
  border,
  colors,
  radius,
  size,
  space,
  typeScale,
} from '@/ui';
import { COOLING_OFF_HOURS, useAllowlist } from '@/wallet/allowlist';

/** base58, 32–44 characters — the shape every Solana address takes. */
const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const FIELD_H = 48;

export default function Allowlist() {
  const router = useRouter();
  const { addresses, add, pendingFor } = useAllowlist();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');

  const trimmed = address.trim();
  const duplicate = addresses.some((a) => a.address === trimmed);
  const valid = ADDRESS.test(trimmed) && label.trim().length > 0 && !duplicate;

  const problem = !trimmed
    ? undefined
    : duplicate
      ? 'That address is already on the list.'
      : ADDRESS.test(trimmed)
        ? undefined
        : 'That does not look like a Solana address.';

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s8 }}>
        <IconButton
          name="back"
          accessibilityLabel="Back"
          background="none"
          onPress={() => router.back()}
        />
        <Text variant="screenTitle">Allowlist</Text>
      </View>

      <Text variant="secondary" style={{ marginTop: space.s10 }}>
        The only addresses funds can leave to. A new one becomes usable {COOLING_OFF_HOURS}{' '}
        hours after you add it.
      </Text>

      <Fill style={{ marginTop: space.s20 }}>
        {addresses.map((a) => {
          const pending = pendingFor(a);
          return (
            <Row
              key={a.address}
              title={a.label}
              secondary={a.address}
              value={
                <Price color={pending ? colors.warn : colors.up}>
                  {pending ? 'Pending' : 'Active'}
                </Price>
              }
              height={68}
            />
          );
        })}

        {adding ? (
          <SheetCard
            borderRadius={radius.panel}
            padding={space.s16}
            style={{ marginTop: space.s16 }}
          >
            <Text variant="cardTitle">New address</Text>
            <Field
              value={label}
              onChangeText={setLabel}
              placeholder="What is it? e.g. Cold storage"
              label="Address label"
            />
            <Field
              value={address}
              onChangeText={setAddress}
              placeholder="Solana address"
              label="Solana address"
              mono
            />
            {problem ? (
              <Text variant="secondarySm" color={colors.down} style={{ marginTop: space.s8 }}>
                {problem}
              </Text>
            ) : null}
            <Button
              label={`Add — usable in ${COOLING_OFF_HOURS} hours`}
              disabled={!valid}
              height={size.ghostSm}
              style={{ marginTop: space.s14 }}
              onPress={() => {
                add(label.trim(), trimmed);
                setLabel('');
                setAddress('');
                setAdding(false);
              }}
            />
          </SheetCard>
        ) : null}
      </Fill>

      <Button
        label={adding ? 'Cancel' : 'Add an address'}
        variant="ghost"
        onPress={() => setAdding((v) => !v)}
      />
    </Screen>
  );
}

function Field({
  value,
  onChangeText,
  placeholder,
  label,
  mono = false,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  label: string;
  mono?: boolean;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.ink35}
      accessibilityLabel={label}
      autoCapitalize="none"
      autoCorrect={false}
      style={[
        typeScale.body,
        border.input,
        {
          color: colors.ink,
          backgroundColor: colors.inputBg,
          borderRadius: radius.tile,
          paddingHorizontal: space.s14,
          height: FIELD_H,
          marginTop: space.s12,
          // An address is read glyph by glyph when it is checked, so it never goes tabular
          // — but it does get the full width and no autocorrect mangling it.
          letterSpacing: mono ? 0.2 : 0,
        },
      ]}
    />
  );
}
