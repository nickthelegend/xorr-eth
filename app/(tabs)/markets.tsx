/**
 * Screen 24 — Markets, all asset classes. screens.md Group B.
 *
 * "Markets" 22/700 + search circle. Horizontally scrolling class pills (default mkt:2,
 * Commodities). Two-part caption row: class note left (max 220, 11.5), "{n} shown · 24/7" right.
 * flex:1 list of 66px rows: 34px gradient mark, symbol + "{name} · {tag}", price + change.
 * Footer "See all {n} …". Tab bar.
 */
import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { Icon } from '@/design/Icon';
import {
  AssetMark,
  ErrorState,
  IconButton,
  LoadingRows,
  Pill,
  PillRow,
  Row,
  Screen,
  ScreenHeader,
  SimulatedTag,
} from '@/design/components';
import { ink, pnl } from '@/design/colors';
import { type } from '@/design/type';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import { useStore } from '@/state/store';
import type { Instrument } from '@/data/types';

export default function MarketsScreen() {
  const router = useRouter();
  const mkt = useStore((s) => s.mkt);
  const setMkt = useStore((s) => s.setMkt);
  const { data, loading, error, reload } = useAsync(() => repos.markets.listClasses(), []);

  const cls = data?.[mkt];
  const rows = useMemo(() => cls?.instruments ?? [], [cls]);

  return (
    <Screen tabbed>
      <ScreenHeader
        left={<Text style={[type.screenTitle, { color: ink.full }]}>Markets</Text>}
        right={
          <IconButton
            name="search"
            accessibilityLabel="Search markets"
            onPress={() => router.push('/search')}
          />
        }
      />

      <PillRow style={{ marginTop: 16, flexGrow: 0 }} contentStyle={{ paddingRight: 20 }}>
        {(data ?? []).map((c, i) => (
          <Pill key={c.id} label={c.label} selected={i === mkt} onPress={() => setMkt(i)} />
        ))}
      </PillRow>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 20,
          gap: 12,
        }}
      >
        <Text style={[type.secondary, { color: ink.i40, maxWidth: 220 }]}>{cls?.note ?? ''}</Text>
        <Text style={[type.footnote, { color: ink.i28 }]}>{rows.length} shown · 24/7</Text>
      </View>

      <Screen.Content style={{ marginTop: 6 }}>
        {loading && !data ? (
          <LoadingRows count={8} />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : (
          <FlashList
            data={rows}
            keyExtractor={(i) => `${i.classId}-${i.sym}`}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <MarketRow item={item} onPress={() => router.push(`/asset/${item.sym}`)} />
            )}
            ListFooterComponent={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={cls?.more ?? 'See all'}
                onPress={() => cls && router.push(`/markets/${cls.id}`)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  paddingTop: 16,
                  paddingBottom: 10,
                }}
              >
                <Text style={[type.secondaryMd, { color: ink.i45, fontWeight: '600' }]}>
                  {cls?.more ?? ''}
                </Text>
                <Icon name="chevron" size={11} color={ink.i45} />
              </Pressable>
            }
          />
        )}
      </Screen.Content>
    </Screen>
  );
}

function MarketRow({ item, onPress }: { item: Instrument; onPress: () => void }) {
  return (
    <Row
      onPress={onPress}
      mark={<AssetMark gradient={{ c1: item.c1, c2: item.c2 }} size={34} />}
      primary={item.sym}
      secondary={`${item.name} · ${item.tag}`}
      value={item.px}
      delta={item.chg}
      deltaColor={item.up ? pnl.up : pnl.down}
      middle={
        // PLAN.md §1.3 item 8 — a price without a feed is labelled, never passed off as live.
        item.feed === 'simulated' ? <SimulatedTag /> : undefined
      }
    />
  );
}
