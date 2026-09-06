/**
 * Screen 2 — Wallet home. screens.md Group B.
 *
 * Rebuilt on `src/ui`, and re-checked against the prototype rather than against the previous
 * build, which had drifted: the hero column is CENTRED (eyebrow, balance, delta chip), the
 * action pills are 42pt at radius 24, and the agent cards hold a 74pt faced orb rather than
 * a 34pt mark in a 106pt-tall card.
 *
 * [G16] The floating chat pill is gone: after the pivot the bot has a centre tab, and a
 * second entry point to the same place on the busiest screen is clutter. PLAN.md 8.2.
 */
import React from 'react';
import { ScrollView, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { agentGradient, assetGradient } from '@/design/gradients';
import {
  AgentOrb,
  AssetMark,
  DeltaChip,
  Eyebrow,
  IconButton,
  NoteStrip,
  Press,
  Price,
  Row,
  Screen,
  Text,
  colors,
  money,
  percent,
  pnlTone,
  quantity,
  radius,
  size,
  space,
} from '@/ui';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import { useHasHydrated, useStore } from '@/state/store';
import { DEFAULT_BUY } from '@/data/tradable';
import { CatchUp } from '@/home/CatchUp';

/** The three equal actions. screens.md: `flex:1`, gutter-padded, never fixed-width. */
const ACTIONS = [
  { label: 'Send', route: '/send' },
  { label: 'Swap', route: '/swap' },
  { label: 'More', route: '/settings' },
] as const;

/** Prototype metrics that belong to this screen alone, named rather than inlined twice. */
const ACTION_H = 42;

export default function Home() {
  const router = useRouter();
  const hydrated = useHasHydrated();
  const wallet = useStore((s) => s.wallet);
  const walletChecked = useStore((s) => s.walletChecked);
  const hired = useStore((s) => s.hired);
  const toggleHire = useStore((s) => s.toggleHire);

  const balance = useAsync(() => repos.portfolio.balanceUsd(), []);
  const agents = useAsync(() => repos.bot.listAgents(), []);
  const featured = useAsync(() => repos.markets.quotes([DEFAULT_BUY]), []);
  // The held quantity was hardcoded at 1,750.30. It comes from the position book now.
  const positions = useAsync(() => repos.portfolio.positions(), []);
  const staking = useAsync(() => repos.yield.staking(), []);

  // null means the balance could not be read. A dash, never a confident $0.00 for a funded
  // wallet.
  const total = balance.data ?? null;
  const featuredQuote = featured.data?.[DEFAULT_BUY];
  const held = positions.data ?? [];
  const featuredHeld = held.find((p) => p.symbol === DEFAULT_BUY);

  // Unrealised P&L across the book, as a percentage of what it cost. Both halves come from
  // real fills; when nothing is held there is no percentage to show and the chip is absent.
  const unrealised = held.reduce((sum, p) => sum + p.unrealised, 0);
  const cost = held.reduce((sum, p) => sum + (p.notional - p.unrealised), 0);
  const unrealisedPct = cost > 0 ? (unrealised / cost) * 100 : undefined;

  /*
   * The entry gate — PLAN.md 2.7.
   *
   * "/" belongs to the tab shell; a user without a wallet is sent to onboarding from here
   * rather than from a competing index route.
   *
   * It waits for TWO things. `hydrated` means the persisted store has loaded from storage;
   * `walletChecked` means the executor has been asked. Waiting only for the first sent every
   * signed-in user whose local storage lacked a wallet — a new device, cleared site data, a
   * deep link — back through sign-up, while the server knew perfectly well who they were.
   */
  if (hydrated && walletChecked && !wallet) return <Redirect href="/welcome" />;

  return (
    <Screen tabBar gutter="none">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: space.gutter,
        }}
      >
        <IconButton name="gear" accessibilityLabel="Settings" onPress={() => router.push('/settings')} />
        {/* One wallet, so no switcher chevron — the prototype's "Wallets ⌄" implies a
            picker this build does not have. */}
        <Text variant="cardTitle">Wallet</Text>
        <IconButton name="more" accessibilityLabel="More options" onPress={() => router.push('/settings')} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
        <View style={{ alignItems: 'center', marginTop: space.s22 }}>
          <Eyebrow>Total value</Eyebrow>
          <Price variant="heroBalance" style={{ marginTop: space.s6 }}>
            {total === null ? '—' : money(total)}
          </Price>
          {unrealisedPct !== undefined ? (
            <DeltaChip
              label={`${unrealised >= 0 ? 'up' : 'down'} ${percent(Math.abs(unrealisedPct)).replace('+', '')} unrealised`}
              tone={pnlTone(unrealised)}
              style={{ alignSelf: 'center', marginTop: space.s8 }}
            />
          ) : null}
        </View>

        <View
          style={{
            flexDirection: 'row',
            gap: space.s10,
            marginTop: space.s22,
            paddingHorizontal: space.gutter,
          }}
        >
          {ACTIONS.map((a) => (
            <Press
              key={a.label}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              onPress={() => router.push(a.route)}
              style={{
                flex: 1,
                minWidth: 0,
                height: ACTION_H,
                borderRadius: radius.panelLg,
                backgroundColor: colors.control,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text variant="rowPrimary">{a.label}</Text>
            </Press>
          ))}
        </View>

        <View style={{ paddingHorizontal: space.gutter, marginTop: space.s26, gap: space.s20 }}>
          <Row
            left={<AssetMark gradient={{ c1: '#B58CFF', c2: '#6E3ED8' }} size={size.markSm} />}
            title="Cash"
            secondary="Available to trade"
            value={<Price>{total === null ? '—' : money(total)}</Price>}
            height={size.hit}
          />

          {/*
            The premise, closed. Renders nothing when nothing happened — a card that reports
            zero is a card people stop reading, and the moment it matters is the moment they
            have stopped.
          */}
          <CatchUp />

          <View>
            <SectionHeader
              title="Agents"
              trailing={`${(agents.data ?? []).filter((a) => a.hired).length} hired`}
              onPress={() => router.push('/bot/roster')}
            />
            <View style={{ flexDirection: 'row', gap: space.s10, marginTop: space.s14 }}>
              {/* Hired agents first: the two cards on the busiest screen should be the two
                  that are actually running, not the first two in roster order. */}
              {[...(agents.data ?? [])]
                .sort((a, b) => Number(!!b.hired) - Number(!!a.hired))
                .slice(0, 2)
                .map((a) => {
                  // Was `idx === 1 && stocksPaused` — a prototype leftover that labelled the
                  // second card from a global flag, so both cards read "Active" while the
                  // header beside them said "1 hired". The hire record is the real state.
                  const isHired = a.hired ?? !!hired[a.name];
                  return (
                    <Press
                      key={a.id}
                      onPress={() => toggleHire(a.name)}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: isHired }}
                      accessibilityLabel={`${a.name}, ${isHired ? 'hired' : 'not hired'}`}
                      style={{
                        // The prototype fixes these at 106pt, which reads as a scrollable
                        // rail of many agents. This build shows exactly two, and at 106 the
                        // pair sits in the left two-thirds with a lopsided gap beside it —
                        // and real agent names wrap, dropping one card's status line below
                        // the other's. `flex:1` fixes both.
                        flex: 1,
                        alignItems: 'center',
                        gap: space.s8,
                        paddingVertical: space.s12,
                        paddingHorizontal: space.s4,
                        borderRadius: radius.card,
                        backgroundColor: colors.surface,
                      }}
                    >
                      <AgentOrb
                        gradient={agentGradient(a.name)}
                        size={size.orb74}
                        face
                        name={a.name}
                        status={isHired ? 'active' : 'paused'}
                      />
                    </Press>
                  );
                })}
            </View>
          </View>

          <View>
            <SectionHeader title="Coins" onPress={() => router.push('/watchlist')} />
            <Row
              left={<AssetMark gradient={assetGradient(DEFAULT_BUY)} size={32} />}
              title={DEFAULT_BUY}
              secondary={
                featuredHeld
                  ? `Wrapped Ether · ${quantity(featuredHeld.units)}`
                  : 'Wrapped Ether · not held'
              }
              value={<Price>{featuredQuote?.price !== undefined ? money(featuredQuote.price) : '—'}</Price>}
              delta={
                featuredQuote?.change24h !== undefined
                  ? percent(featuredQuote.change24h, 2)
                  : undefined
              }
              deltaTone={pnlTone(featuredQuote?.change24h ?? 0)}
              height={size.rowSm}
              divider={false}
              onPress={() => router.push(`/asset/${DEFAULT_BUY}`)}
            />

            {/*
              Tappable, because it stopped being only a fact. Once tier 4 can put money at
              Aave, this strip is the only place on the home screen that mentions it — and a
              user with a supplied balance needs somewhere to go to see it and take it back.
              A statement about a rate you cannot act on is where the money goes to hide.
            */}
            <Press
              onPress={() => router.push('/yield')}
              accessibilityRole="button"
              accessibilityLabel="See what you have earning at Aave"
              style={{ marginTop: space.s6, marginBottom: space.s20 }}
            >
              <NoteStrip kind="acted">
                {staking.data
                  ? // `estimatedApy` is a fraction (0.0388); `percent` takes points.
                    `Idle USDC can earn about ${percent(staking.data.estimatedApy * 100, 2).replace('+', '')} a year on Aave. ${staking.data.note}`
                  : 'Supply rates are unavailable right now, so there is no figure to quote.'}
              </NoteStrip>
            </Press>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

/**
 * A section break. The prototype writes it as a 14/600 ink55 label with a "›" and a quiet
 * trailing count — no rule above it, which is why this is a plain row and not a `Row`.
 */
function SectionHeader({
  title,
  trailing,
  onPress,
}: {
  title: string;
  trailing?: string;
  onPress?: () => void;
}) {
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      hitHeight={size.hit}
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
    >
      <Text variant="rowPrimary" color={colors.ink55}>
        {title} ›
      </Text>
      {trailing ? (
        <Text variant="secondary" color={colors.ink40}>
          {trailing}
        </Text>
      ) : null}
    </Press>
  );
}
