/**
 * Assets tab — NEW. PLAN.md 10.2 / §3.5.
 *
 * The handoff's "Assets" tab was never designed [G13]. Built from parts that already exist:
 * the stacked proportion bar from screen 10, market rows with sparklines from screen 5, and the
 * wallet address. No new visual language.
 */
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  AssetMark,
  EmptyState,
  LoadingRows,
  Row,
  Screen,
  ScreenHeader,
  SheetCard,
} from '@/design/components';
import { ink, pnl } from '@/design/colors';
import { radius } from '@/design/space';
import { type } from '@/design/type';
import { money, percent, quantity } from '@/format';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import { useStore } from '@/state/store';
import { weightBarPct } from '@/state/derived';

export default function Assets() {
  const router = useRouter();
  const wallet = useStore((s) => s.wallet);
  const balance = useAsync(() => repos.portfolio.balanceUsd(), []);
  const sleeves = useAsync(() => repos.portfolio.sleeves(), []);
  const positions = useAsync(() => repos.portfolio.positions(), []);

  const weights = (sleeves.data ?? []).map((s) => s.weight);
  // Real holdings from the position book. This previously listed watchlist FIXTURES, so it
  // showed assets the user did not own at prices that never moved.
  const holdings = positions.data ?? [];

  return (
    <Screen tabbed>
      <ScreenHeader left={<Text style={[type.screenTitle, { color: ink.full }]}>Assets</Text>} />

      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1, marginTop: 20 }}>
        <Text style={[type.eyebrowSm, { color: ink.i32 }]}>Portfolio value</Text>
        <Text style={[type.heroBalance, { color: ink.full, marginTop: 8 }]}>
          {balance.data === null || balance.data === undefined ? "—" : money(balance.data)}
        </Text>

        <SheetCard radius={radius.xl} padding={16} style={{ marginTop: 20 }}>
          <Text style={[type.eyebrowSm, { color: ink.i32 }]}>Allocation</Text>
          {/* The 8px stacked proportion bar from screen 10, reused verbatim. */}
          <View style={{ flexDirection: 'row', gap: 2, height: 8, marginTop: 12 }}>
            {(sleeves.data ?? []).map((s, i) => (
              <View
                key={s.name}
                style={{
                  width: `${weightBarPct(weights, i)}%`,
                  backgroundColor: s.color,
                  borderRadius: 4,
                }}
              />
            ))}
          </View>
          <View style={{ marginTop: 14, gap: 10 }}>
            {(sleeves.data ?? []).map((s) => (
              <View key={s.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View
                  style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.color }}
                />
                <Text style={[type.body, { color: ink.full, flex: 1 }]}>{s.name}</Text>
                <Text style={[type.rowValue, { color: ink.i55 }]}>{s.weight}%</Text>
              </View>
            ))}
          </View>
        </SheetCard>

        <Text style={[type.cardTitleSm, { color: ink.full, marginTop: 26, marginBottom: 6 }]}>
          Holdings
        </Text>
        {positions.loading ? (
          <LoadingRows count={2} height={64} />
        ) : holdings.length === 0 ? (
          <EmptyState text="Nothing held yet. A recurring buy is the simplest way to start." />
        ) : (
          holdings.map((h) => (
            <Row
              key={h.id}
              mark={<AssetMark gradient={{ c1: '#5B93FF', c2: '#49E39B' }} size={32} />}
              primary={h.symbol}
              secondary={`${quantity(h.units)} · avg ${money(h.entry)}`}
              value={money(h.notional)}
              delta={percent(h.unrealisedPct)}
              deltaColor={h.unrealised >= 0 ? pnl.up : pnl.down}
              height={64}
              onPress={() => router.push(`/asset/${h.symbol}`)}
            />
          ))
        )}

        <SheetCard radius={radius.xl} padding={16} style={{ marginTop: 26, marginBottom: 24 }}>
          <Text style={[type.eyebrowSm, { color: ink.i32 }]}>Wallet</Text>
          <Text style={[type.body, { color: ink.full, marginTop: 8 }]} numberOfLines={1}>
            {wallet?.address ?? 'No wallet connected'}
          </Text>
          <Text style={[type.footnote, { color: ink.i28, marginTop: 6 }]}>
            {wallet
              ? `${wallet.kind === 'embedded' ? 'Created in xorr' : 'Connected'} · ${wallet.cluster}`
              : 'Create or connect one to let the bot trade.'}
          </Text>
        </SheetCard>
      </ScrollView>
    </Screen>
  );
}
