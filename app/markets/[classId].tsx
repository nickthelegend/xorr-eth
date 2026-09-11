/**
 * "See all {n} markets" — PLAN.md 10.5 [G14]. Screen 24's footer link had no destination.
 * The full list for one class, paginated so a 300-instrument class stays scrollable.
 */
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useGoBack } from '@/nav/useGoBack';
import {
  AssetMark,
  Button,
  EmptyState,
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
import { logoProps, useLogos } from '@/data/useLogos';
import type { Instrument } from '@/data/types';

const PAGE = 25;

/** "Crypto, Tokenized equities and Commodities" — an Oxford-comma-free list for one sentence. */
function listOf(labels: string[]): string {
  if (labels.length === 0) return 'no classes at all';
  if (labels.length === 1) return labels[0]!;
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

export default function ClassList() {
  const { classId } = useLocalSearchParams<{ classId: string }>();
  const router = useRouter();
  const goBack = useGoBack();
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useAsync(() => repos.markets.listClasses(), []);

  const cls = data?.find((c) => c.id === classId);
  const rows = useMemo(() => (cls?.instruments ?? []).slice(0, page * PAGE), [cls, page]);
  const logos = useLogos(useMemo(() => rows.map((r) => r.sym), [rows]));
  const hasMore = (cls?.instruments.length ?? 0) > rows.length;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s8, flex: 1 }}>
          <IconButton
            name="back"
            accessibilityLabel="Back"
            background="none"
            onPress={() => goBack()}
          />
          <Text variant="screenTitle" numberOfLines={1}>
            {cls?.label ?? 'Markets'}
          </Text>
        </View>
        <Text variant="footnote" color={colors.ink28}>
          {/*
            "0 of 0 markets" is a claim, and while the classes are loading it is a false one — this
            screen showed it for a full twenty seconds before rendering nine. The list below already
            renders LoadingRows for exactly that window; this line was still asserting a count.
            Same fix as the Markets tab.
          */}
          {loading && !data
            ? 'Loading markets'
            : // Nor is it a true one for a class that does not exist. Same reason: it counts
              // something, and there is nothing here to count.
              !cls
              ? ''
              : `${rows.length} of ${cls.instruments.length} markets`}
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
        ) : !cls ? (
          /*
            The classes loaded and none of them is the one in the URL.
            
            Rendering the list anyway gave a black screen under the word "Markets" with "0 of 0
            markets" in the corner — indistinguishable from a class that exists and happens to be
            empty, and from a failed load. A stale link or a typo lands here, so it should say
            which it is and name the classes that do exist.
          */
          <EmptyState
            text={`There is no "${classId}" class. This build lists ${listOf(data?.map((c) => c.label) ?? [])}.`}
            actionLabel="Browse all markets"
            onAction={() => router.replace('/(tabs)/markets')}
          />
        ) : (
          <FlashList
            data={rows}
            keyExtractor={(i: Instrument) => i.sym}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }: { item: Instrument }) => (
              <Row
                left={
                  <AssetMark
                    gradient={{ c1: item.c1, c2: item.c2 }}
                    {...logoProps(logos, item.sym)}
                    size={size.mark}
                  />
                }
                title={item.sym}
                secondary={`${item.name} · ${item.tag}`}
                middle={
                  item.feed === 'simulated' ? (
                    <Tag label="No price feed" small tone="warn" />
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
