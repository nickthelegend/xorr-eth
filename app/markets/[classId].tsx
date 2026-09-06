/**
 * "See all {n} markets" — PLAN.md 10.5 [G14]. Screen 24's footer link had no destination.
 * The full list for one class, paginated so a 300-instrument class stays scrollable.
 */
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  AssetMark,
  Button,
  ErrorState,
  Fill,
  IconButton,
  LoadingRows,
  Price,
  Row,
  Screen,
  Tag,
  Text,
  colors,
  size,
  space,
} from '@/ui';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import type { Instrument } from '@/data/types';

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
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s8, flex: 1 }}>
          <IconButton
            name="back"
            accessibilityLabel="Back"
            background="none"
            onPress={() => router.back()}
          />
          <Text variant="screenTitle" numberOfLines={1}>
            {cls?.label ?? 'Markets'}
          </Text>
        </View>
        <Text variant="footnote" color={colors.ink28}>
          {rows.length} of {cls?.instruments.length ?? 0} markets
        </Text>
      </View>

      <Text variant="secondary" style={{ marginTop: space.s10 }}>
        {cls?.note ?? ''}
      </Text>

      <Fill style={{ marginTop: space.s10 }}>
        {loading && !data ? (
          <LoadingRows count={8} />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : (
          <FlashList
            data={rows}
            keyExtractor={(i: Instrument) => i.sym}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }: { item: Instrument }) => (
              <Row
                left={<AssetMark gradient={{ c1: item.c1, c2: item.c2 }} size={size.mark} />}
                title={item.sym}
                secondary={`${item.name} · ${item.tag}`}
                middle={
                  item.feed === 'simulated' ? (
                    <Tag label="Simulated" small tone="warn" />
                  ) : undefined
                }
                value={<Price>{item.px}</Price>}
                delta={item.chg}
                deltaTone={item.up ? 'up' : 'down'}
                onPress={() => router.push(`/asset/${item.sym}`)}
              />
            )}
            ListFooterComponent={
              hasMore ? (
                <Button
                  label="Show more"
                  variant="ghost"
                  height={size.ghostSm}
                  style={{ marginVertical: space.s16 }}
                  onPress={() => setPage((p) => p + 1)}
                />
              ) : null
            }
          />
        )}
      </Fill>
    </Screen>
  );
}
