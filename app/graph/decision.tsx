/**
 * Which venue the router would pick, and what it compared to get there.
 *
 * `/graph/decision` reads the subgraph for this wallet's own history and returns the choice plus its
 * inputs. It is the only place in the product where an on-chain index feeds a decision rather than a
 * report, which is exactly the kind of claim that should be inspectable rather than described.
 *
 * The response is deliberately rendered generically. It is a decision object whose fields the
 * router owns and will change as the router changes, and hardcoding a layout for today's fields
 * would either drop new ones silently or invent labels for fields that no longer exist. Keys are
 * shown as sent.
 */
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useGoBack } from '@/nav/useGoBack';
import {
  ErrorState,
  Fill,
  HeaderBar,
  Pill,
  PillRow,
  Placeholder,
  Screen,
  SheetCard,
  Text,
  colors,
  radius,
  space,
} from '@/ui';
import { money } from '@/format';
import { useAsync } from '@/data/useAsync';
import { system } from '@/data/system';

const SIZES = [100, 500, 2_500] as const;

/** Values as sent, formatted only where the type is unambiguous. */
function render(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export default function GraphDecision() {
  const goBack = useGoBack();
  const [usd, setUsd] = useState<number>(SIZES[0]);
  const { data, loading, error, reload } = useAsync(() => system.graphDecision(usd), [usd]);

  const entries = Object.entries(data ?? {});

  return (
    <Screen gutter="none">
      <View style={{ paddingHorizontal: space.gutter }}>
        <HeaderBar onBack={goBack} title={<Text variant="screenTitle">Decision</Text>} />
        <Text variant="secondary" color={colors.ink40} style={{ marginTop: space.s8 }}>
          What the router would choose for this size, from what the subgraph knows about this
          wallet.
        </Text>
      </View>

      <PillRow style={{ marginTop: space.s14 }} contentPadding={space.gutter}>
        {SIZES.map((s) => (
          <Pill key={s} label={money(s)} selected={s === usd} onPress={() => setUsd(s)} />
        ))}
      </PillRow>

      <Fill style={{ marginTop: space.s12, paddingHorizontal: space.gutter }}>
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : loading && !data ? (
          <Placeholder height={170} />
        ) : entries.length === 0 ? (
          <Text variant="body" color={colors.ink40}>
            The router returned nothing for this size.
          </Text>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: space.s30, gap: space.s10 }}
          >
            {entries.map(([key, value]) => (
              <SheetCard key={key} bordered borderRadius={radius.panel} padding={space.s14}>
                <Text variant="footnote" color={colors.ink40}>
                  {key}
                </Text>
                <Text variant="secondary" color={colors.ink65} style={{ marginTop: space.s6 }}>
                  {render(value)}
                </Text>
              </SheetCard>
            ))}
          </ScrollView>
        )}
      </Fill>
    </Screen>
  );
}
