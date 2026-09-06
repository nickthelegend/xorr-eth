/**
 * Add custom alert — PLAN.md 10.9 [G14]. Screen 18's ghost button had no destination.
 */
import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, IconButton, Screen, ScreenHeader, Segmented } from '@/design/components';
import { borders, ink, pnl, surfaces } from '@/design/colors';
import { repos } from '@/data';
import { hairlineWidth, radius } from '@/design/space';
import { type } from '@/design/type';
import { DEFAULT_BUY } from '@/data/tradable';

const KINDS = ['Price', 'Agent', 'Risk'];

export default function NewAlert() {
  const router = useRouter();
  const [kind, setKind] = useState(0);
  const [symbol, setSymbol] = useState<string>(DEFAULT_BUY);
  const [level, setLevel] = useState('95');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  /**
   * Save it.
   *
   * This screen built an alert object and then called `router.back()`, so it looked like it worked
   * and remembered nothing. An alert that is not persisted is an alert that will not fire.
   */
  async function create() {
    setBusy(true);
    setError(undefined);
    try {
      const kindId = (['price', 'agent', 'risk'] as const)[kind]!;
      await repos.alerts.create({
        kind: kindId,
        symbol,
        name: `${symbol} above $${level}`,
        detail: `Notifies you once when ${symbol} trades above $${level}.`,
        config: { above: Number(level) },
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
      <ScreenHeader
        left={<Text style={[type.screenTitle, { color: ink.full }]}>New alert</Text>}
        right={
          <IconButton name="close" accessibilityLabel="Close" onPress={() => router.back()} />
        }
      />

      <Text style={[type.secondary, { color: ink.i40, marginTop: 10 }]}>
        Alerts interrupt you. Circuit breakers stop the bot. This creates the first kind.
      </Text>

      <Segmented
        options={KINDS}
        value={kind}
        onChange={setKind}
        style={{ marginTop: 18 }}
        accessibilityLabel="Alert kind"
      />

      <Screen.Content style={{ marginTop: 20, gap: 14 }}>
        <Field label="Symbol" value={symbol} onChange={setSymbol} />
        <Field label="Above" value={level} onChange={setLevel} keyboard="decimal-pad" />
      </Screen.Content>

      {error ? (
        <Text style={[type.footnote, { color: pnl.down, marginBottom: 8 }]}>
          {`That did not save: ${error}`}
        </Text>
      ) : null}
      <Button
        label={`Alert me when ${symbol} is above $${level}`}
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  keyboard?: 'default' | 'decimal-pad';
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={[type.eyebrowSm, { color: ink.i32 }]}>{label}</Text>
      <View
        style={{
          height: 48,
          borderRadius: radius.md2,
          backgroundColor: surfaces.inputBg,
          borderWidth: hairlineWidth,
          borderColor: borders.input,
          paddingHorizontal: 14,
          justifyContent: 'center',
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType={keyboard}
          style={[type.body, { color: ink.full }]}
          accessibilityLabel={label}
        />
      </View>
    </View>
  );
}
