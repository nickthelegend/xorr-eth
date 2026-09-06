/**
 * Add custom alert — PLAN.md 10.9 [G14]. Screen 18's ghost button had no destination.
 *
 * And then it had one that did nothing: the screen built an alert object and called
 * `router.back()`, so it looked like it worked and remembered nothing. An alert that is not
 * persisted is an alert that will not fire.
 */
import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Button,
  Eyebrow,
  Fill,
  IconButton,
  NoteStrip,
  Screen,
  Segmented,
  Text,
  border,
  colors,
  radius,
  space,
  typeScale,
} from '@/ui';
import { repos } from '@/data';
import { DEFAULT_BUY } from '@/data/tradable';

type Kind = 'price' | 'agent' | 'risk';

const KINDS = [
  { value: 'price', label: 'Price' },
  { value: 'agent', label: 'Agent' },
  { value: 'risk', label: 'Risk' },
] as const satisfies readonly { value: Kind; label: string }[];

const FIELD_H = 48;

export default function NewAlert() {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>('price');
  const [symbol, setSymbol] = useState<string>(DEFAULT_BUY);
  const [level, setLevel] = useState('95');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const value = parseFloat(level);
  const sym = symbol.trim().toUpperCase();
  const valid = sym.length > 0 && Number.isFinite(value) && value > 0;

  async function create() {
    if (!valid) return;
    setBusy(true);
    setError(undefined);
    try {
      await repos.alerts.create({
        kind,
        symbol: sym,
        name: `${sym} above $${level}`,
        detail: `Notifies you once when ${sym} trades above $${level}.`,
        config: { above: value },
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="screenTitle">New alert</Text>
        <IconButton name="close" accessibilityLabel="Close" onPress={() => router.back()} />
      </View>

      <Text variant="secondary" style={{ marginTop: space.s10 }}>
        Alerts interrupt you. Circuit breakers stop the bot. This creates the first kind.
      </Text>

      <Segmented
        options={KINDS}
        value={kind}
        onChange={setKind}
        style={{ marginTop: space.s18 }}
      />

      <Fill style={{ marginTop: space.s20, gap: space.s14 }}>
        <Field label="Symbol" value={symbol} onChange={setSymbol} autoCapitalize="characters" />
        <Field label="Above" value={level} onChange={setLevel} keyboard="decimal-pad" />

        <NoteStrip kind="acted">
          The executor watches this, not your phone — so it still fires with the app closed.
          It notifies once, then turns itself off.
        </NoteStrip>

        {error ? (
          <Text variant="secondarySm" color={colors.down}>
            {`That did not save: ${error}`}
          </Text>
        ) : null}
      </Fill>

      <Button
        label={valid ? `Alert me when ${sym} is above $${level}` : 'Enter a symbol and a price'}
        disabled={!valid}
        loading={busy}
        onPress={() => void create()}
      />
    </Screen>
  );
}

function Field({
  label,
  value,
  onChange,
  keyboard = 'default',
  autoCapitalize = 'none',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  keyboard?: 'default' | 'decimal-pad';
  autoCapitalize?: 'none' | 'characters';
}) {
  return (
    <View style={{ gap: space.s8 }}>
      <Eyebrow small>{label}</Eyebrow>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType={keyboard}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        accessibilityLabel={label}
        style={[
          typeScale.body,
          border.input,
          {
            height: FIELD_H,
            borderRadius: radius.tile,
            backgroundColor: colors.inputBg,
            paddingHorizontal: space.s14,
            color: colors.ink,
          },
        ]}
      />
    </View>
  );
}
