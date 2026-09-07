/**
 * Withdrawal allowlist — PLAN.md 10.6 / 12.21 [G31].
 *
 * Screen 20 shows "2 addresses" with nothing behind it. Adding one starts a cooling-off
 * period, so an attacker who gets the phone still cannot move funds today.
 *
 * "Add an address" had no `onPress`. It does now — the entry is validated, persisted, and
 * starts its cooling-off clock, which is what makes the "Pending" state on the row below
 * mean something.
 */
import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useGoBack } from '@/nav/useGoBack';
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
import { COOLING_OFF_HOURS, isValidAddress, normaliseAddress, useAllowlist } from '@/wallet/allowlist';

/*
 * The validator lives in the store, and there is exactly one of it.
 *
 * This screen had its own copy — base58, 32–44 characters, the shape a SOLANA address takes,
 * left over from before the pivot. Base58 has no `0` and no `x`, so every real Base address
 * failed it: the button never enabled, and the screen told the user their own wallet "does not
 * look like a Solana address". The store's `add()` has validated `0x…` correctly the whole
 * time; this regex sat in front of it and never let a valid address through.
 */
const FIELD_H = 48;

export default function Allowlist() {
  const goBack = useGoBack();
  const { addresses, add, pendingFor } = useAllowlist();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');

  const trimmed = normaliseAddress(address);
  // Case-insensitively, because `0xAB…` and `0xab…` are one address — and the store dedupes that
  // way, so an exact-match check here disagreed with the refusal the user actually got.
  const duplicate = addresses.some((a) => a.address.toLowerCase() === trimmed.toLowerCase());
  const valid = isValidAddress(trimmed) && label.trim().length > 0 && !duplicate;

  const problem = !trimmed
    ? undefined
    : duplicate
      ? 'That address is already on the list.'
      : isValidAddress(trimmed)
        ? undefined
        : 'That is not a Base address. It should start 0x and be 42 characters.';

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s8 }}>
        <IconButton
          name="back"
          accessibilityLabel="Back"
          background="none"
          onPress={() => goBack()}
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
              placeholder="0x…"
              label="Base address"
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
