/**
 * Screen 25 — Commodity perpetual contract. screens.md Group B.
 *
 * Tag chips PERPETUAL (amber-tinted) / NO EXPIRY / SPOT FEED. 132px area chart.
 * Leverage card: "Leverage / on $800 margin" + 22/700 multiplier, 2x/5x/10x segmented, then
 * Position size / Liquidation / Funding rows and a warning line that changes colour with leverage.
 * 2x2 stat grid built from 1px gaps over rgba(255,255,255,.06) so the gutters READ AS HAIRLINES.
 * Short (control) / Long (#F5CE5F on #1A1204).
 */
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Button,
  ButtonRow,
  IconButton,
  Row,
  Screen,
  ScreenHeader,
  Segmented,
  SheetCard,
  SimulatedTag,
} from '@/design/components';
import { borders, commodity, ink, pnl, surfaces } from '@/design/colors';
import { radius } from '@/design/space';
import { type } from '@/design/type';
import { compactMoney, countdown, money, percent, price as fmtPrice } from '@/format';
import { LEVERAGE_OPTIONS, leverageSummary } from '@/state/derived';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import { useStore } from '@/state/store';
import { Candlestick, projectCandles, tight } from '@/charts';

export default function PerpContract() {
  const { symbol = 'XAUT' } = useLocalSearchParams<{ symbol: string }>();
  const router = useRouter();
  const lev = useStore((s) => s.lev);
  const setLev = useStore((s) => s.setLev);

  // Everything on this screen comes from the venue. PLAN.md 12.15 [G37].
  // The handoff's gold contract has no perp market of its own, so the metrics are read for the
  // liquid proxy the venue actually lists; the screen labels the feed either way.
  const feedSymbol = symbol === 'XAUT' ? 'BTC' : symbol;
  const { data: m, loading } = useAsync(() => repos.perps.metrics(feedSymbol), [feedSymbol]);
  // Real OHLC for THIS contract. A perp with no spot feed gets no chart, and says so.
  const candles = useAsync(() => repos.markets.candles(feedSymbol, '1H'), [feedSymbol]);
  const perpCandles = candles.data?.bars ?? [];
  const isProxy = feedSymbol !== symbol;
  const summary = leverageSummary(lev, m?.markPx);

  // The countdown is DERIVED from the venue's next-funding time plus a ticking clock, rather than
  // seeded into state by an effect — seeding causes a cascading render on every data change.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  // Purely derived: the venue returns an ABSOLUTE next-funding time, so the countdown is just
  // that minus the ticking clock. No anchoring effect, no drift for time spent in flight.
  const fundingIn = m ? Math.max(0, Math.round((m.nextFundingAt - now) / 1000)) : 0;

  const warnColor =
    summary.band === 'danger' ? pnl.down : summary.band === 'warn' ? pnl.warn : ink.i40;

  return (
    <Screen tabbed>
      <ScreenHeader
        left={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <IconButton
              name="back"
              accessibilityLabel="Back"
              background="transparent"
              color={ink.i55}
              onPress={() => router.back()}
            />
            <Text style={[type.cardTitleSm, { color: ink.full }]}>{symbol}/USDT</Text>
          </View>
        }
        right={m && !isProxy ? null : <SimulatedTag label={isProxy ? 'Proxy feed' : 'Simulated'} />}
      />

      <View style={{ marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={[type.priceMedium, { color: ink.full }]}>
          {m ? fmtPrice(m.markPx) : loading ? '—' : 'No feed'}
        </Text>
        {m ? (
          <Text
            style={[
              type.rowDelta,
              { color: m.markVsIndex >= 0 ? pnl.up : pnl.down, fontWeight: '600' },
            ]}
          >
            {money(m.markVsIndex, { explicitSign: true })} vs index
          </Text>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', gap: 6, marginTop: 12 }}>
        <TagChip label="Perpetual" tint />
        <TagChip label="No expiry" />
        <TagChip label={m ? `Max ${m.maxLeverage}x` : 'Spot feed'} />
      </View>

      {/*
        Real candles for this symbol, or none.
        This drew `areaSeries.XAUT` — gold's shape — under every perp regardless of which contract
        was open. The repository already refuses to invent bars; the screen was undoing that.
      */}
      {perpCandles.length > 1 ? (
        <Candlestick
          candles={projectCandles(perpCandles, tight(perpCandles))}
          height={132}
          style={{ marginTop: 16 }}
        />
      ) : (
        <View style={{ height: 132, marginTop: 16, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[type.body, { color: ink.i40 }]}>No price history for this contract.</Text>
        </View>
      )}

      <Screen.Content style={{ marginTop: 16 }}>
        <SheetCard radius={radius.xl} padding={16}>
          <View
            style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}
          >
            <View style={{ gap: 2 }}>
              <Text style={[type.cardTitleSm, { color: ink.full }]}>Leverage</Text>
              <Text style={[type.secondary, { color: ink.i38 }]}>on $800 margin</Text>
            </View>
            <Text style={[type.statLarge, { color: ink.full }]}>{lev}x</Text>
          </View>

          <Segmented
            options={LEVERAGE_OPTIONS.map((l) => `${l}x`)}
            value={LEVERAGE_OPTIONS.indexOf(lev as 2 | 5 | 10)}
            onChange={(i) => setLev(LEVERAGE_OPTIONS[i]!)}
            style={{ marginTop: 14 }}
            accessibilityLabel="Leverage"
          />

          <View style={{ marginTop: 6 }}>
            <Row primary="Position size" value={summary.notional} height={48} />
            <Row
              primary="Liquidation"
              value={summary.liquidation}
              valueColor={pnl.down}
              height={48}
            />
            <Row
              primary="Funding"
              value={m ? `${percent(m.fundingRate * 100, { digits: 4 })} / 1h` : '—'}
              height={48}
              divider={false}
            />
          </View>

          <Text style={[type.noteBody, { color: warnColor, marginTop: 8 }]}>{summary.warning}</Text>
        </SheetCard>

        {/* 2x2 stat grid: 1px gaps over the card border colour, so the gutters read as hairlines. */}
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            marginTop: 16,
            backgroundColor: borders.card,
            gap: 1,
            borderRadius: radius.md2,
            overflow: 'hidden',
          }}
        >
          <StatCell
            label="Open interest"
            value={m ? compactMoney(m.openInterestUsd) : '—'}
          />
          <StatCell label="24h volume" value={m ? compactMoney(m.dayVolumeUsd) : '—'} />
          <StatCell
            label="Mark vs index"
            value={m ? money(m.markVsIndex, { explicitSign: true }) : '—'}
          />
          <StatCell label="Next funding" value={m ? countdown(fundingIn) : '—'} />
        </View>
      </Screen.Content>

      <ButtonRow
        style={{ marginTop: 14 }}
        affirmativeFlex={1}
        secondary={<Button label="Short" variant="secondary" />}
        affirmative={<Button label="Long" variant="gold" />}
      />
    </Screen>
  );
}

function TagChip({ label, tint = false }: { label: string; tint?: boolean }) {
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: radius.xs2,
        backgroundColor: tint ? 'rgba(245,206,95,0.14)' : surfaces.surfaceAlt,
      }}
    >
      <Text style={[type.tagSm, { color: tint ? commodity.goldFill : ink.i55 }]}>{label}</Text>
    </View>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        width: '49.9%',
        backgroundColor: surfaces.bg,
        paddingVertical: 14,
        paddingHorizontal: 14,
        gap: 6,
      }}
    >
      <Text style={[type.footnoteSm, { color: ink.i32 }]}>{label}</Text>
      <Text style={[type.rowValue, { color: ink.full }]}>{value}</Text>
    </View>
  );
}
