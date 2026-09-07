/**
 * Add custom alert — PLAN.md 10.9 [G14]. Screen 18's ghost button had no destination.
 *
 * And then it had one that did nothing: the screen built an alert object and called
 * `goBack()`, so it looked like it worked and remembered nothing. An alert that is not
 * persisted is an alert that will not fire.
 */
import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useGoBack } from '@/nav/useGoBack';
import {
  Button,
  Eyebrow,
  Fill,
  IconButton,
  NoteStrip,
  Screen,
  Text,
  border,
  colors,
  radius,
  space,
  typeScale,
} from '@/ui';
import { repos } from '@/data';
import { DEFAULT_BUY } from '@/data/tradable';


const FIELD_H = 48;

export default function NewAlert() {
  const goBack = useGoBack();
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
        kind: 'price',
        symbol: sym,
        name: `${sym} above $${level}`,
        detail: `Notifies you once when ${sym} trades above $${level}.`,
        config: { above: value },
      });
      goBack();
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
        <IconButton name="close" accessibilityLabel="Close" onPress={() => goBack()} />
      </View>

      <Text variant="secondary" style={{ marginTop: space.s10 }}>
        Alerts interrupt you. Circuit breakers stop the bot. This creates the first kind.
      </Text>

      {/*
        The kind selector is gone, because it was never real.

        It switched an internal `kind` between price, agent and risk and the form below never
        changed: the same Symbol and Above fields, the same "Alert me when X is above $Y" button.
        Tapping Agent or Risk looked like a dead control — nothing on screen moved — and was worse
        than dead, because it then POSTed `kind: 'agent'` carrying `{ above: 95 }`. The executor
        evaluates an agent alert by looking for an agent and a risk alert by reading the policy,
        so either one would have been created successfully and then failed every time it ran.

        This screen builds a price alert, which is what its own first line has always said: "This
        creates the first kind." Risk alerts come from the catalogue on /alerts, which the
        executor knows how to evaluate.
      */}
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
