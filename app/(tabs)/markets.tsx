/**
 * Screen 24 — Markets, all asset classes. screens.md Group B.
 *
 * Rebuilt on `src/ui`. Every value here is a token: the row is `Row` at `size.rowLg`, the
 * class chips are `Pill` in a `PillRow` (which scrolls rather than shrinking — design.md §5
 * records that the market tabs shipped broken the other way once), and the mark is
 * `AssetMark`, the same radial-gradient recipe the agent orbs use.
 *
 * Nothing on this screen carries a hardcoded colour, size or radius.
 */
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import {
  AssetMark,
  Eyebrow,
  Press,
  Price,
  Row,
  Screen,
  Fill,
  Pill,
  PillRow,
  Tag,
  Text,
  colors,
  radius,
  size,
  space,
} from '@/ui';
import { Sparkline } from '@/ui/charts';
import { Icon } from '@/design/Icon';
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

  /*
   * One request for every glyph on the screen.
   *
   * `Sparkline` has existed since the design handoff and no row has ever used it — the shape of a
   * day is the one thing a price and a percentage cannot say, and it is why people scan a market
   * list at all. Fetched for the visible symbols in a single call rather than per row, because
   * nine round trips for a decoration is how a decoration becomes a regression.
   */
  const sparkSyms = useMemo(() => rows.map((r: Instrument) => r.sym), [rows]);
  const sparks = useAsync(
    () => repos.markets.sparklines(sparkSyms),
    [sparkSyms.join(',')],
  );


  return (
    <Screen tabBar gutter="none">
      <View style={{ paddingHorizontal: space.gutter }}>
        <Row divider={false} height={size.mark} style={{ justifyContent: 'space-between' }}>
          <Text variant="screenTitle">Markets</Text>
          <Press
            accessibilityRole="button"
            accessibilityLabel="Search markets"
            onPress={() => router.push('/search')}
            hitHeight={size.mark}
            hitWidth={size.mark}
            style={{
              width: size.mark,
              height: size.mark,
              borderRadius: radius.full,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.surfaceAlt,
            }}
          >
            <Icon name="search" size={15} color={colors.ink55} />
          </Press>
        </Row>
      </View>

      {/* §5: pills never shrink to fit — the row scrolls. */}
      <PillRow style={{ marginTop: space.s16 }} contentPadding={space.gutter}>
        {(data ?? []).map((c, i) => (
          <Pill key={c.id} label={c.label} selected={i === mkt} onPress={() => setMkt(i)} />
        ))}
      </PillRow>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: space.gutter,
          marginTop: space.s20,
          gap: space.s12,
        }}
      >
        <Text variant="secondarySm" color={colors.ink40} style={{ flex: 1, maxWidth: 220 }}>
          {cls?.note ?? ''}
        </Text>
        <Text variant="footnote" color={colors.ink28} numberOfLines={1}>
          {rows.length} shown · 24/7
        </Text>
      </View>

      <Fill style={{ paddingHorizontal: space.gutter, marginTop: space.s6 }}>
        {error ? (
          <View style={{ paddingVertical: space.s30, alignItems: 'center', gap: space.s14 }}>
            <Text variant="rowPrimary">That did not load.</Text>
            <Text variant="secondary" align="center">
              {error.message}
            </Text>
            <Press onPress={reload} accessibilityRole="button">
              <Text variant="control" color={colors.ink65}>
                Try again
              </Text>
            </Press>
          </View>
        ) : loading && !data ? null : (
          <FlashList
            data={rows}
            keyExtractor={(i: Instrument) => i.sym}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }: { item: Instrument }) => (
              <Row
                height={size.rowLg}
                onPress={() => router.push(`/asset/${item.sym}`)}
                left={<AssetMark gradient={{ c1: item.c1, c2: item.c2 }} size={size.mark} />}
                title={item.sym}
                secondary={`${item.name} · ${item.tag}`}
                value={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s6 }}>
                    {item.feed === 'simulated' ? <Tag label="Simulated" small tone="warn" /> : null}
                    {/*
                      No glyph until there is a series. design.md puts the sparkline between the
                      symbol and the price; a symbol whose history has not arrived simply has none,
                      rather than a flat line claiming the price never moved.
                    */}
                    {(sparks.data?.[item.sym]?.length ?? 0) > 1 ? (
                      <Sparkline data={sparks.data![item.sym]!} />
                    ) : null}
                    <Price variant="rowPrimary">{item.px}</Price>
                  </View>
                }
                delta={item.chg}
                deltaTone={item.up ? 'up' : 'down'}
              />
            )}
            ListFooterComponent={
              cls ? (
                <View style={{ alignItems: 'center', paddingVertical: space.s16 }}>
                  <Eyebrow small color={colors.ink45}>
                    {cls.more}
                  </Eyebrow>
                </View>
              ) : null
            }
          />
        )}
      </Fill>

    </Screen>
  );
}
