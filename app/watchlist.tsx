/**
 * Screen 5 — Watchlist. screens.md Group B.
 *
 * PLAN.md §3.6 resolves the handoff's open question ("ship one, not both"): screen 24 is the
 * Markets tab; this is a sub-screen off Home -> Coins, with the STANDARD tab bar. The white
 * floating footer is dropped.
 *
 * Five scrolling group tabs, group eyebrow + "{n} markets · 24h", 64px rows with a 90x30 white
 * sparkline between symbol and price.
 */
import React from 'react';
import { ScrollView, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Sparkline } from '@/charts';
import {
  AssetMark,
  IconButton,
  Pill,
  PillRow,
  Row,
  Screen,
  ScreenHeader,
  SimulatedTag,
} from '@/design/components';
import { ink, pnl } from '@/design/colors';
import { percent, price as fmtPrice } from '@/format';
import { usePrices } from '@/data/usePrices';
import { type } from '@/design/type';
import { watchlistGroups } from '@/data/fixtures/series';
import { useStore } from '@/state/store';

export default function Watchlist() {
  const router = useRouter();
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const group = watchlistGroups[tab] ?? watchlistGroups[0]!;
  // The fixture rows carry the sparkline shape; the PRICE comes from the market.
  const { quotes } = usePrices(group.rows.map((r) => r.sym));

  return (
    <Screen>
      <ScreenHeader
        left={<Text style={[type.screenTitle, { color: ink.full }]}>Markets</Text>}
        right={
          <IconButton
            name="back"
            accessibilityLabel="Back"
            background="transparent"
            color={ink.i55}
            onPress={() => router.back()}
          />
        }
      />

      <PillRow style={{ marginTop: 16, flexGrow: 0 }}>
        {watchlistGroups.map((g, i) => (
          <Pill key={g.tab} label={g.tab} selected={i === tab} onPress={() => setTab(i)} />
        ))}
      </PillRow>

      <Text style={[type.eyebrowSm, { color: ink.i32, marginTop: 22 }]}>
        {group.label} · {group.rows.length} markets · 24h
      </Text>

      <Screen.Content style={{ marginTop: 6 }}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {group.rows.map((r) => (
            <Row
              key={r.sym}
              mark={<AssetMark gradient={{ c1: '#5B93FF', c2: '#49E39B' }} size={32} />}
              primary={r.sym}
              middle={quotes[r.sym] ? <Sparkline points={r.spark} /> : <SimulatedTag />}
              value={quotes[r.sym] ? fmtPrice(quotes[r.sym]!.price) : r.px}
              delta={
                quotes[r.sym] ? percent(quotes[r.sym]!.change24h, { digits: 2 }) : r.chg
              }
              deltaColor={
                (quotes[r.sym] ? quotes[r.sym]!.change24h >= 0 : r.up) ? pnl.up : pnl.down
              }
              height={64}
              onPress={() => router.push(`/asset/${r.sym}`)}
            />
          ))}
        </ScrollView>
      </Screen.Content>
    </Screen>
  );
}
