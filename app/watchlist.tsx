/**
 * Screen 5 — Watchlist. screens.md Group B.
 *
 * PLAN.md §3.6 resolves the handoff's open question ("ship one, not both"): screen 24 is
 * the Markets tab; this is a sub-screen off Home → Coins, with the STANDARD tab bar. The
 * white floating footer is dropped.
 *
 * Five scrolling group tabs, group eyebrow + "{n} markets · 24h", 64pt rows with a 90×30
 * sparkline between symbol and price.
 *
 * The sparkline used to be `r.spark` — a polyline string baked into the fixtures from the
 * prototype. A hand-drawn squiggle sitting beside a live price is exactly the thing PLAN
 * §1.3.8 forbids, so the shape now comes from the symbol's own hourly closes. A symbol
 * whose series we cannot fetch gets no line rather than someone else's.
 */
import React, { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { assetGradient } from '@/design/gradients';
import {
  AssetMark,
  Eyebrow,
  Fill,
  IconButton,
  Pill,
  PillRow,
  Price,
  Row,
  Screen,
  Sparkline,
  Tag,
  Text,
  percent,
  price as fmtPrice,
  space,
} from '@/ui';
import { usePrices } from '@/data/usePrices';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import { watchlistGroups } from '@/data/fixtures/series';
import { useStore } from '@/state/store';

const ROW_H = 64;

export default function Watchlist() {
  const router = useRouter();
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const group = watchlistGroups[tab] ?? watchlistGroups[0]!;
  const symbols = useMemo(() => group.rows.map((r) => r.sym), [group]);

  const { quotes } = usePrices(symbols);

  // One pass over the visible group — nine symbols at most, and only when the tab changes.
  const { data: sparks } = useAsync(async () => {
    const entries = await Promise.all(
      symbols.map(async (sym) => {
        const c = await repos.markets.candles(sym, '1H').catch(() => null);
        return [sym, (c?.bars ?? []).map((b) => b[3])] as const;
      }),
    );
    return Object.fromEntries(entries) as Record<string, number[]>;
  }, [symbols]);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="screenTitle">Markets</Text>
        <IconButton
          name="back"
          accessibilityLabel="Back"
          background="none"
          onPress={() => router.back()}
        />
      </View>

      <PillRow style={{ marginTop: space.s16, flexGrow: 0 }}>
        {watchlistGroups.map((g, i) => (
          <Pill key={g.tab} label={g.tab} selected={i === tab} onPress={() => setTab(i)} />
        ))}
      </PillRow>

      <Eyebrow small style={{ marginTop: space.s22 }}>
        {group.label} · {group.rows.length} markets · 24h
      </Eyebrow>

      <Fill style={{ marginTop: space.s6 }}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {group.rows.map((r) => {
            const q = quotes[r.sym];
            const closes = sparks?.[r.sym] ?? [];
            return (
              <Row
                key={r.sym}
                left={<AssetMark gradient={assetGradient(r.sym)} size={32} />}
                title={r.sym}
                middle={
                  <View style={{ marginHorizontal: space.s10 }}>
                    {closes.length > 1 ? (
                      <Sparkline data={closes} />
                    ) : q?.price !== undefined ? null : (
                      <Tag label="Simulated" small tone="warn" />
                    )}
                  </View>
                }
                value={<Price>{q?.price !== undefined ? fmtPrice(q.price) : r.px}</Price>}
                delta={q?.change24h !== undefined ? percent(q.change24h, 2) : r.chg}
                deltaTone={(q?.change24h !== undefined ? q.change24h >= 0 : r.up) ? 'up' : 'down'}
                height={ROW_H}
                onPress={() => router.push(`/asset/${r.sym}`)}
              />
            );
          })}
        </ScrollView>
      </Fill>
    </Screen>
  );
}
