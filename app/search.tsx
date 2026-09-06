/**
 * Markets search — PLAN.md 10.4 [G14]. The search circle on screen 24 had no destination.
 * Symbol search across all 5 classes, using the same Row the market list uses.
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  AssetMark,
  EmptyState,
  Fill,
  IconButton,
  Price,
  Row,
  Screen,
  Text,
  border,
  colors,
  radius,
  space,
  typeScale,
} from '@/ui';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';

const FIELD_H = 46;
/** With no query, show a sample rather than all 45 — the list is a starting point. */
const PREVIEW = 12;

export default function Search() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const { data, loading } = useAsync(() => repos.markets.listClasses(), []);

  const results = useMemo(() => {
    const all = (data ?? []).flatMap((c) => c.instruments);
    if (!q.trim()) return all.slice(0, PREVIEW);
    const needle = q.trim().toLowerCase();
    return all.filter(
      (i) => i.sym.toLowerCase().includes(needle) || i.name.toLowerCase().includes(needle),
    );
  }, [data, q]);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="screenTitle">Search</Text>
        <IconButton name="close" accessibilityLabel="Close search" onPress={() => router.back()} />
      </View>

      <View
        style={[
          {
            marginTop: space.s18,
            height: FIELD_H,
            borderRadius: radius.panel,
            backgroundColor: colors.inputBg,
            paddingHorizontal: space.s16,
            justifyContent: 'center',
          },
          border.input,
        ]}
      >
        <TextInput
          value={q}
          onChangeText={setQ}
          autoFocus
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="Symbol or name"
          placeholderTextColor={colors.ink35}
          style={[typeScale.body, { color: colors.ink }]}
          accessibilityLabel="Search markets"
        />
      </View>

      <Fill style={{ marginTop: space.s10 }}>
        {results.length === 0 ? (
          // A blank query with nothing loaded yet is not "no matches" — it is "not yet".
          <EmptyState
            text={
              loading
                ? 'Loading markets…'
                : q.trim()
                  ? `Nothing matches "${q}".`
                  : 'No markets available right now.'
            }
          />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {results.map((i) => (
              <Row
                key={`${i.classId}-${i.sym}`}
                left={<AssetMark gradient={{ c1: i.c1, c2: i.c2 }} size={32} />}
                title={i.sym}
                secondary={`${i.name} · ${i.tag}`}
                value={<Price>{i.px}</Price>}
                delta={i.chg}
                deltaTone={i.up ? 'up' : 'down'}
                height={62}
                onPress={() => router.replace(`/asset/${i.sym}`)}
              />
            ))}
          </ScrollView>
        )}
      </Fill>
    </Screen>
  );
}
