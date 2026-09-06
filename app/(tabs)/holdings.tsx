/**
 * Assets tab — NEW. PLAN.md 10.2 / §3.5.
 *
 * The handoff's "Assets" tab was never designed [G13]. Built from parts that already exist:
 * the stacked proportion bar from screen 10, holdings rows, the realised card, and the
 * wallet. No new visual language — and no design values of its own; everything is `src/ui`.
 */
import React from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { assetGradient } from '@/design/gradients';
import {
  AssetMark,
  EmptyState,
  Eyebrow,
  LoadingRows,
  Price,
  Row,
  Screen,
  SheetCard,
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
import { signedMoney } from '@/format';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import { useStore } from '@/state/store';
import { weightBarPct } from '@/state/derived';

const BAR_H = 8;

export default function Assets() {
  const router = useRouter();
  const wallet = useStore((s) => s.wallet);
  const balance = useAsync(() => repos.portfolio.balanceUsd(), []);
  const sleeves = useAsync(() => repos.portfolio.sleeves(), []);
  const positions = useAsync(() => repos.portfolio.positions(), []);
  const realised = useAsync(() => repos.portfolio.realised(), []);

  const weights = (sleeves.data ?? []).map((s) => s.weight);
  // Real holdings from the position book. This previously listed watchlist FIXTURES, so it
  // showed assets the user did not own at prices that never moved.
  const holdings = positions.data ?? [];

  return (
    <Screen tabBar>
      <Text variant="screenTitle">Assets</Text>

      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1, marginTop: space.s20 }}>
        <Eyebrow small>Portfolio value</Eyebrow>
        {/* `money(balance.data ?? 0)` reported "$0.00" whenever the executor was
            unreachable — a confident number for a question we never got to ask. An em dash
            says the same thing the code actually knows. */}
        <Price variant="heroBalance" style={{ marginTop: space.s8 }}>
          {balance.data === null || balance.data === undefined ? '—' : money(balance.data)}
        </Price>
        {balance.error ? (
          <Text variant="secondary" style={{ marginTop: space.s6 }}>
            Could not reach the executor, so this is not your balance.
          </Text>
        ) : null}

        <SheetCard borderRadius={radius.panel} padding={space.s16} style={{ marginTop: space.s20 }}>
          <Eyebrow small>Allocation</Eyebrow>
          {/* The 8pt stacked proportion bar from screen 10, reused verbatim. */}
          <View style={{ flexDirection: 'row', gap: space.s2, height: BAR_H, marginTop: space.s12 }}>
            {(sleeves.data ?? []).map((s, i) => (
              <View
                key={s.name}
                style={{
                  width: `${weightBarPct(weights, i)}%`,
                  backgroundColor: s.color,
                  borderRadius: BAR_H / 2,
                }}
              />
            ))}
          </View>
          <View style={{ marginTop: space.s14, gap: space.s10 }}>
            {(sleeves.data ?? []).map((s) => (
              <View
                key={s.name}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.s10 }}
              >
                <View
                  style={{
                    width: BAR_H,
                    height: BAR_H,
                    borderRadius: BAR_H / 2,
                    backgroundColor: s.color,
                  }}
                />
                <Text variant="body" style={{ flex: 1 }}>
                  {s.name}
                </Text>
                <Price color={colors.ink55}>{s.weight}%</Price>
              </View>
            ))}
          </View>
        </SheetCard>

        <Text variant="cardTitle" style={{ marginTop: space.s26, marginBottom: space.s6 }}>
          Holdings
        </Text>
        {positions.loading ? (
          <LoadingRows count={2} height={size.rowLg} />
        ) : holdings.length === 0 ? (
          <EmptyState
            text="Nothing held yet. A recurring buy is the simplest way to start."
            actionLabel="Set one up"
            onAction={() => router.push('/strategy/dca')}
          />
        ) : (
          holdings.map((h) => (
            <Row
              key={h.id}
              left={<AssetMark gradient={assetGradient(h.symbol)} size={32} />}
              title={h.symbol}
              secondary={`${quantity(h.units)} · avg ${money(h.entry)}`}
              value={<Price>{money(h.notional)}</Price>}
              delta={percent(h.unrealisedPct)}
              deltaTone={pnlTone(h.unrealised)}
              height={size.rowLg}
              onPress={() => router.push(`/asset/${h.symbol}`)}
            />
          ))
        )}

        {/*
          Money actually taken, kept apart from money on paper.
          `Holdings` above shows what the open book is worth today, which is an opinion that
          changes every minute. This is the other number — what selling has actually realised
          — and it used to exist nowhere: a position that closed took its profit out of the
          app with it, because the holdings query correctly filters to units > 0.
        */}
        {realised.data && realised.data.bySymbol.length > 0 ? (
          <SheetCard
            borderRadius={radius.panel}
            padding={space.s16}
            style={{ marginTop: space.s26 }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'baseline',
              }}
            >
              <Eyebrow small>Realised</Eyebrow>
              <Price tone={pnlTone(realised.data.total)}>{signedMoney(realised.data.total)}</Price>
            </View>
            {realised.data.bySymbol.map((r) => (
              <View
                key={r.symbol}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  marginTop: space.s10,
                }}
              >
                <Text variant="body" color={colors.ink55}>
                  {r.symbol} · {quantity(r.unitsSold)} sold
                  {/* Said inline, because a number that quietly understates is worse than
                      one that admits it. */}
                  {r.basisIncomplete ? ' · basis incomplete' : ''}
                </Text>
                <Price variant="body" tone={pnlTone(r.realised)}>
                  {signedMoney(r.realised)}
                </Price>
              </View>
            ))}
            <Text variant="footnote" color={colors.ink28} style={{ marginTop: space.s12 }}>
              At average cost. Closed positions stay here even though they are no longer
              holdings.
            </Text>
          </SheetCard>
        ) : null}

        <SheetCard
          borderRadius={radius.panel}
          padding={space.s16}
          style={{ marginTop: space.s26, marginBottom: space.s26 }}
        >
          <Eyebrow small>Wallet</Eyebrow>
          <Text variant="body" style={{ marginTop: space.s8 }} numberOfLines={1}>
            {wallet?.address ?? 'No wallet connected'}
          </Text>
          <Text variant="footnote" color={colors.ink28} style={{ marginTop: space.s6 }}>
            {wallet
              ? // The live chain, not the one the wallet row was stamped with at creation.
                `${wallet.kind === 'embedded' ? 'Created in xorr' : 'Connected'} · ${wallet.chain ?? wallet.cluster}`
              : 'Create or connect one to let the bot trade.'}
          </Text>
        </SheetCard>
      </ScrollView>
    </Screen>
  );
}
