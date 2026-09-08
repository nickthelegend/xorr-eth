/**
 * The largest moves today, in both directions, across every class.
 *
 * Markets is organised by what a thing IS — crypto, equities, commodities — which is the right
 * default and answers a different question from "what happened". A mover list cuts across all five
 * classes and sorts by magnitude, which is the only view in the app where a commodity and a
 * tokenized equity appear next to each other because they moved the same amount.
 *
 * Derived from the same `listClasses` payload the markets screen already fetches, so this costs no
 * extra round trip and cannot disagree with the list it came from.
 *
 * Both directions, always, and never truncated to "top movers". A screen that shows only gainers on
 * a red day is a screen that lies by omission.
 */
import React, { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useGoBack } from '@/nav/useGoBack';
import {
  AssetMark,
  EmptyState,
  ErrorState,
  Eyebrow,
  Fill,
  HeaderBar,
  LoadingRows,
  Price,
  Row,
  Screen,
  Text,
  colors,
  size,
  space,
} from '@/ui';
import { assetGradient } from '@/design/gradients';
import { useAsync } from '@/data/useAsync';
import { logoProps, useLogos } from '@/data/useLogos';
import { repos } from '@/data';
import type { Instrument } from '@/data/types';

/** How many each way. Enough to be a list, few enough to be a glance. */
const SHOWN = 8;

/**
 * The percentage out of the formatted change string.
 *
 * `Instrument.chg` is already formatted for display — the app formats once, at the source, and
 * everything downstream renders the string. Sorting needs the magnitude back, and re-deriving it
 * here beats adding a parallel numeric field that could disagree with the text beside it.
 */
function magnitude(chg: string): number {
  const n = Number(chg.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export default function Movers() {
  const goBack = useGoBack();
  const router = useRouter();
  const { data, loading, error, reload } = useAsync(() => repos.markets.listClasses(), []);

  const { up, down } = useMemo(() => {
    const all = (data ?? []).flatMap((c) => c.instruments);
    const rank = (xs: Instrument[]) =>
      [...xs].sort((a, b) => magnitude(b.chg) - magnitude(a.chg)).slice(0, SHOWN);
    return {
      up: rank(all.filter((i) => i.up)),
      down: rank(all.filter((i) => !i.up)),
    };
  }, [data]);

  const symbols = useMemo(() => [...up, ...down].map((i) => i.sym), [up, down]);
  const logos = useLogos(symbols);

  const section = (title: string, rows: Instrument[]) =>
    rows.length === 0 ? null : (
      <View style={{ marginTop: space.s20 }}>
        <Eyebrow>{title}</Eyebrow>
        {rows.map((i) => (
          <Row
            key={`${i.classId}-${i.sym}`}
            height={size.rowLg}
            onPress={() => router.push(`/asset/${i.sym}`)}
            left={<AssetMark gradient={assetGradient(i.sym)} {...logoProps(logos, i.sym)} size={size.mark} />}
            title={i.sym}
            secondary={`${i.name} · ${i.tag}`}
            value={<Price variant="rowPrimary">{i.px}</Price>}
            delta={i.chg}
            deltaTone={i.up ? 'up' : 'down'}
          />
        ))}
      </View>
    );

  return (
    <Screen gutter="none">
      <View style={{ paddingHorizontal: space.gutter }}>
        <HeaderBar onBack={goBack} title={<Text variant="screenTitle">Movers</Text>} />
        <Text variant="secondary" color={colors.ink40} style={{ marginTop: space.s8 }}>
          Across every class, sorted by how far they moved.
        </Text>
      </View>

      <Fill style={{ marginTop: space.s6, paddingHorizontal: space.gutter }}>
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : loading && !data ? (
          <LoadingRows count={8} height={size.rowLg} />
        ) : up.length === 0 && down.length === 0 ? (
          <EmptyState text="No markets have loaded, so nothing can be ranked." />
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: space.s30 }}
          >
            {section('Up', up)}
            {section('Down', down)}
          </ScrollView>
        )}
      </Fill>
    </Screen>
  );
}
