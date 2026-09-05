/**
 * Markets search — PLAN.md 10.4 [G14]. The search circle on screen 24 had no destination.
 * Symbol search across all 5 classes, using the same Row the market list uses.
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AssetMark, EmptyState, IconButton, Row, Screen, ScreenHeader } from '@/design/components';
import { borders, ink, pnl, surfaces } from '@/design/colors';
import { hairlineWidth, radius } from '@/design/space';
import { type } from '@/design/type';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';

export default function Search() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const { data } = useAsync(() => repos.markets.listClasses(), []);

  const results = useMemo(() => {
    const all = (data ?? []).flatMap((c) => c.instruments);
    if (!q.trim()) return all.slice(0, 12);
    const needle = q.trim().toLowerCase();
    return all.filter(
      (i) => i.sym.toLowerCase().includes(needle) || i.name.toLowerCase().includes(needle),
    );
  }, [data, q]);

  return (
    <Screen>
      <ScreenHeader
        left={<Text style={[type.screenTitle, { color: ink.full }]}>Search</Text>}
        right={
          <IconButton
            name="close"
            accessibilityLabel="Close search"
            onPress={() => router.back()}
          />
        }
      />

      <View
        style={{
          marginTop: 18,
          height: 46,
          borderRadius: radius.xl,
          backgroundColor: surfaces.inputBg,
          borderWidth: hairlineWidth,
          borderColor: borders.input,
          paddingHorizontal: 16,
          justifyContent: 'center',
        }}
      >
        <TextInput
          value={q}
          onChangeText={setQ}
          autoFocus
          placeholder="Symbol or name"
          placeholderTextColor={ink.i35}
          style={[type.body, { color: ink.full }]}
          accessibilityLabel="Search markets"
        />
      </View>

      <Screen.Content style={{ marginTop: 10 }}>
        {results.length === 0 ? (
          <EmptyState text={`Nothing matches "${q}".`} />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {results.map((i) => (
              <Row
                key={`${i.classId}-${i.sym}`}
                mark={<AssetMark gradient={{ c1: i.c1, c2: i.c2 }} size={32} />}
                primary={i.sym}
                secondary={`${i.name} · ${i.tag}`}
                value={i.px}
                delta={i.chg}
                deltaColor={i.up ? pnl.up : pnl.down}
                height={62}
                onPress={() => router.replace(`/asset/${i.sym}`)}
              />
            ))}
          </ScrollView>
        )}
      </Screen.Content>
    </Screen>
  );
}
