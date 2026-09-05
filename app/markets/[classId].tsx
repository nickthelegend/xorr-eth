/**
 * "See all {n} markets" — PLAN.md 10.5 [G14]. Screen 24's footer link had no destination.
 * The full list for one class, paginated so a 300-instrument class stays scrollable.
 */
import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  AssetMark,
  Button,
  ErrorState,
  IconButton,
  LoadingRows,
  Row,
  Screen,
  ScreenHeader,
  SimulatedTag,
} from '@/design/components';
import { ink, pnl } from '@/design/colors';
import { type } from '@/design/type';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';

const PAGE = 25;

export default function ClassList() {
  const { classId } = useLocalSearchParams<{ classId: string }>();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useAsync(() => repos.markets.listClasses(), []);

  const cls = data?.find((c) => c.id === classId);
  const rows = useMemo(() => (cls?.instruments ?? []).slice(0, page * PAGE), [cls, page]);
  const hasMore = (cls?.instruments.length ?? 0) > rows.length;

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
            <Text style={[type.screenTitle, { color: ink.full }]}>{cls?.label ?? 'Markets'}</Text>
          </View>
        }
        right={
          <Text style={[type.footnote, { color: ink.i28 }]}>
            {cls?.instruments.length ?? 0} markets
          </Text>
        }
      />

      <Text style={[type.secondary, { color: ink.i40, marginTop: 10 }]}>{cls?.note ?? ''}</Text>

      <Screen.Content style={{ marginTop: 10 }}>
        {loading && !data ? (
          <LoadingRows count={8} />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : (
          <FlashList
            data={rows}
            keyExtractor={(i) => i.sym}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <Row
                mark={<AssetMark gradient={{ c1: item.c1, c2: item.c2 }} size={34} />}
                primary={item.sym}
                secondary={`${item.name} · ${item.tag}`}
                value={item.px}
                delta={item.chg}
                deltaColor={item.up ? pnl.up : pnl.down}
                middle={item.feed === 'simulated' ? <SimulatedTag /> : undefined}
                onPress={() => router.push(`/asset/${item.sym}`)}
              />
            )}
            ListFooterComponent={
              hasMore ? (
                <Button
                  label="Show more"
                  variant="ghost"
                  style={{ marginTop: 16 }}
                  onPress={() => setPage((p) => p + 1)}
                />
              ) : null
            }
          />
        )}
      </Screen.Content>
    </Screen>
  );
}
