/**
 * Screen 2 — Wallet home. screens.md Group B.
 *
 * Gear / "Wallets" / more header. Eyebrow "Total value", balance 46/700, up delta chip.
 * Three EQUAL action pills (Send / Swap / More) — flex:1, gutter-padded, never fixed-width.
 * Cash row. "Agents" header with count. Two 106px agent cards. "Coins" -> row + staking note.
 *
 * [G16] The floating chat pill is gone: after the pivot the bot has a centre tab, and a second
 * entry point to the same place on the busiest screen is clutter. PLAN.md 8.2 called this.
 */
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { Icon } from '@/design/Icon';
import {
  AgentOrb,
  AssetMark,
  IconButton,
  NoteStrip,
  Row,
  Screen,
  ScreenHeader,
} from '@/design/components';
import { borders, ink, pnl, surfaces } from '@/design/colors';
import { agentGradient } from '@/design/gradients';
import { hairlineWidth, radius } from '@/design/space';
import { type } from '@/design/type';
import { money, percent, quantity } from '@/format';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import { hiredCount, useHasHydrated, useStore } from '@/state/store';
import { DEFAULT_BUY } from '@/data/tradable';

export default function Home() {
  const router = useRouter();
  const hydrated = useHasHydrated();
  const wallet = useStore((s) => s.wallet);
  const hired = useStore((s) => s.hired);
  const stocksPaused = useStore((s) => s.stocksPaused);
  const toggleStocksPaused = useStore((s) => s.toggleStocksPaused);

  const balance = useAsync(() => repos.portfolio.balanceUsd(), []);
  const agents = useAsync(() => repos.bot.listAgents(), []);
  const featured = useAsync(() => repos.markets.quotes([DEFAULT_BUY]), []);
  // The held quantity was hardcoded at 1,750.30. It comes from the position book now.
  const positions = useAsync(() => repos.portfolio.positions(), []);
  const staking = useAsync(() => repos.yield.staking(), []);

  // null means the balance could not be read. A dash, never a confident $0.00 for a funded wallet.
  const total = balance.data ?? null;
  const featuredQuote = featured.data?.[DEFAULT_BUY];
  const featuredHeld = (positions.data ?? []).find((p) => p.symbol === DEFAULT_BUY);

  // The entry gate — PLAN.md 2.7. "/" belongs to the tab shell; a user without a wallet is sent to
  // onboarding from here rather than from a competing index route. Waiting for hydration first
  // stops a returning user seeing the splash flash before their wallet loads from storage.
  if (hydrated && !wallet) return <Redirect href="/welcome" />;

  return (
    <Screen tabbed>
      <ScreenHeader
        left={
          <IconButton name="gear" accessibilityLabel="Settings" onPress={() => router.push('/settings')} />
        }
        right={<IconButton name="more" accessibilityLabel="More options" />}
      />

      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1, marginTop: 22 }}>
        <Text style={[type.eyebrowSm, { color: ink.i32 }]}>Total value</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
          <Text style={[type.heroBalance, { color: ink.full }]}>
            {total === null ? '—' : money(total)}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
          {([
            { label: 'Send', route: '/send' },
            { label: 'Swap', route: '/swap' },
            { label: 'More', route: '/settings' },
          ] as const).map((a) => (
            <Pressable
              key={a.label}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              onPress={() => router.push(a.route)}
              // design.md: flex:1, never fixed-width.
              style={({ pressed }) => ({
                flex: 1,
                height: 44,
                borderRadius: radius.xl,
                backgroundColor: surfaces.control,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={[type.pill, { color: ink.full }]}>{a.label}</Text>
            </Pressable>
          ))}
        </View>

        <Row
          primary="Cash"
          secondary="Available to trade"
          value={total === null ? '—' : money(total)}
          height={58}
          style={{ marginTop: 18 }}
        />

        <SectionHeader
          title="Agents"
          count={`${hiredCount(hired)} hired`}
          onPress={() => router.push('/bot/roster')}
        />

        <View style={{ flexDirection: 'row', gap: 12 }}>
          {(agents.data ?? []).slice(0, 2).map((a, idx) => {
            const paused = idx === 1 && stocksPaused;
            return (
              <Pressable
                key={a.id}
                onPress={idx === 1 ? toggleStocksPaused : () => router.push('/bot')}
                accessibilityRole="button"
                accessibilityLabel={`${a.name}, ${paused ? 'paused' : 'active'}`}
                style={({ pressed }) => ({
                  flex: 1,
                  height: 106,
                  borderRadius: radius.lg2,
                  backgroundColor: surfaces.surface,
                  padding: 14,
                  justifyContent: 'space-between',
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <AgentOrb
                  gradient={agentGradient(a.name)}
                  size={34}
                  face
                  breathe={!paused}
                />
                <View style={{ gap: 3 }}>
                  <Text style={{ fontSize: 12.5, fontWeight: '600', color: ink.full }}>
                    {a.name}
                  </Text>
                  <Text
                    style={{
                      fontSize: 10.5,
                      fontWeight: '600',
                      color: paused ? ink.i40 : pnl.up,
                    }}
                  >
                    {paused ? 'Paused' : 'Active'}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <SectionHeader title="Coins" onPress={() => router.push('/watchlist')} />

        <Row
          mark={<AssetMark gradient={{ c1: '#5B93FF', c2: '#49E39B' }} size={34} />}
          primary={DEFAULT_BUY}
          secondary={
            featuredHeld ? `Wrapped Ether · ${quantity(featuredHeld.units)}` : 'Wrapped Ether · not held'
          }
          value={featuredQuote ? money(featuredQuote.price) : '—'}
          delta={
            featuredQuote?.change24h !== undefined
              ? percent(featuredQuote.change24h, { digits: 2 })
              : undefined
          }
          deltaColor={(featuredQuote?.change24h ?? 0) >= 0 ? pnl.up : pnl.down}
          onPress={() => router.push(`/asset/${DEFAULT_BUY}`)}
        />

        {/*
          Tappable, because it stopped being only a fact.
          Once tier 4 can put money at Aave, this strip is the only place on the home screen that
          mentions it — and a user with a supplied balance needs somewhere to go to see it and take
          it back. A statement about a rate you cannot act on is where the money goes to hide.
        */}
        <Pressable
          onPress={() => router.push('/yield')}
          accessibilityRole="button"
          accessibilityLabel="See what you have earning at Aave"
          style={{ marginTop: 16, marginBottom: 20 }}
        >
          <NoteStrip kind="acted">
            {staking.data
              // `estimatedApy` is a fraction (0.0388); `percent` takes percentage points.
              ? `Idle USDC can earn about ${percent(staking.data.estimatedApy * 100, { digits: 2 }).replace('+', '')} a year on Aave. ${staking.data.note}`
              : 'Supply rates are unavailable right now, so there is no figure to quote.'}
          </NoteStrip>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

function SectionHeader({
  title,
  count,
  onPress,
}: {
  title: string;
  count?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 26,
        marginBottom: 12,
        borderTopWidth: hairlineWidth,
        borderTopColor: borders.hairline,
        paddingTop: 18,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={[type.cardTitleSm, { color: ink.full }]}>{title}</Text>
        <Icon name="chevron" size={12} color={ink.i55} />
      </View>
      {count ? <Text style={[type.footnote, { color: ink.i28 }]}>{count}</Text> : null}
    </Pressable>
  );
}
