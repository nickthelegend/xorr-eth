/**
 * Screen 25 — Commodity perpetual contract. screens.md Group B.
 *
 * Tag chips PERPETUAL (amber-tinted) / NO EXPIRY / max leverage. A 132pt area chart.
 * Leverage card: "Leverage / on ${margin} margin" + 22/700 multiplier, 2x/5x/10x segmented,
 * then Position size / Liquidation / Funding rows and a warning line that changes colour
 * with leverage. A 2×2 stat grid whose 1pt gutters read as hairlines. Short / Long.
 *
 * Short and Long had no `onPress`; they open the order ticket now.
 */
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  AreaChart,
  Button,
  ButtonPair,
  Fill,
  IconButton,
  Price,
  Row,
  Screen,
  Segmented,
  SheetCard,
  StatGrid,
  Tag,
  Text,
  colors,
  money,
  percent,
  price as fmtPrice,
  radius,
  size,
  space,
} from '@/ui';
import { compactMoney, countdown } from '@/format';
import { LEVERAGE_OPTIONS, PERP_MARGIN, leverageSummary } from '@/state/derived';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import { useStore } from '@/state/store';

/**
 * No proxy table, on purpose.
 *
 * This screen used to map XAUT to **BTC** so that a symbol with no feed entry would still
 * produce a number — and it read "XAUT/USDT $79,900" while gold traded near $4,400. Nothing
 * about Bitcoin's price, funding or open interest says anything about gold, and the
 * liquidation price and margin warning on this screen were computed off it. A "Proxy feed"
 * label does not make another asset's number true; PLAN.md §1.3.8 says every price on screen
 * is real, or labelled, and that was neither.
 *
 * The fix belongs in the feed, not here: `server/src/market/ids.ts` now carries XAUT's own
 * CoinGecko id. A symbol with no feed gets no number and the screen says "No feed", which is
 * the honest answer.
 */

const CHART_H = 132;
const LEV_OPTIONS = LEVERAGE_OPTIONS.map((l) => ({ value: l as number, label: `${l}x` }));

export default function PerpContract() {
  const { symbol = 'XAUT' } = useLocalSearchParams<{ symbol: string }>();
  const router = useRouter();
  const lev = useStore((s) => s.lev);
  const setLev = useStore((s) => s.setLev);

  // Everything on this screen comes from the venue. PLAN.md 12.15 [G37].
  const feedSymbol = symbol;
  const { data: m, loading } = useAsync(() => repos.perps.metrics(feedSymbol), [feedSymbol]);
  // The venue's own recent marks, for the same contract the metrics above describe.
  const series = useAsync(() => repos.markets.candles(feedSymbol, '1H'), [feedSymbol]);
  const closes = (series.data?.bars ?? []).map((b) => b[3]);
  const summary = leverageSummary(lev, m?.markPx);

  // The countdown is DERIVED from the venue's next-funding time plus a ticking clock,
  // rather than seeded into state by an effect — seeding causes a cascading render on
  // every data change.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  const fundingIn = m ? Math.max(0, Math.round((m.nextFundingAt - now) / 1000)) : 0;

  const warnColor =
    summary.band === 'danger' ? colors.down : summary.band === 'warn' ? colors.warn : colors.ink40;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s8, flex: 1 }}>
          <IconButton
            name="back"
            accessibilityLabel="Back"
            background="none"
            onPress={() => router.back()}
          />
          <Text variant="cardTitle">{symbol}/USDT</Text>
        </View>
        {m ? null : <Tag label="Simulated" small tone="warn" />}
      </View>

      <View
        style={{
          marginTop: space.s18,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.s10,
        }}
      >
        <Price variant="priceMd">{m ? fmtPrice(m.markPx) : loading ? '—' : 'No feed'}</Price>
        {m ? (
          <Price variant="delta" tone={m.markVsIndex >= 0 ? 'up' : 'down'}>
            {money(m.markVsIndex, { signed: true })} vs index
          </Price>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', gap: space.s6, marginTop: space.s12 }}>
        <Tag label="Perpetual" small colors={{ bg: colors.goldBg, fg: colors.goldFill }} />
        <Tag label="No expiry" small colors={{ bg: colors.surfaceAlt, fg: colors.ink55 }} />
        <Tag
          label={m ? `Max ${m.maxLeverage}x` : 'Spot feed'}
          small
          colors={{ bg: colors.surfaceAlt, fg: colors.ink55 }}
        />
      </View>

      {/* This drew `areaSeries.XAUT` — one hand-authored curve, rendered under EVERY perp
          symbol regardless of which one you opened, and regardless of whether a feed
          existed. It was a picture of a price history that never happened. The chart is
          the venue's own recent marks or it is nothing. */}
      {closes.length > 1 ? (
        <AreaChart
          data={closes}
          height={CHART_H}
          color={colors.goldFill}
          style={{ marginTop: space.s16 }}
        />
      ) : (
        <View style={{ height: CHART_H, marginTop: space.s16, justifyContent: 'center' }}>
          <Text variant="secondary">No price history for {symbol}.</Text>
        </View>
      )}

      <Fill style={{ marginTop: space.s16 }}>
        <SheetCard borderRadius={radius.panel} padding={space.s16}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
            }}
          >
            <View style={{ gap: space.s2 }}>
              <Text variant="cardTitle">Leverage</Text>
              <Text variant="secondarySm">
                on {money(PERP_MARGIN, { decimals: 0 })} margin
              </Text>
            </View>
            <Price variant="screenTitle">{lev}x</Price>
          </View>

          <Segmented
            options={LEV_OPTIONS}
            value={lev}
            onChange={setLev}
            style={{ marginTop: space.s14 }}
          />

          <View style={{ marginTop: space.s6 }}>
            <Row title="Position size" value={<Price>{summary.notional}</Price>} height={size.rowSm} />
            <Row
              title="Liquidation"
              value={<Price tone="down">{summary.liquidation}</Price>}
              height={size.rowSm}
            />
            <Row
              title="Funding"
              value={
                <Price>
                  {m?.fundingRate != null ? `${percent(m.fundingRate * 100, 4)} / 1h` : '—'}
                </Price>
              }
              height={size.rowSm}
              divider={false}
            />
          </View>

          <Text variant="secondarySm" color={warnColor} style={{ marginTop: space.s8 }}>
            {summary.warning}
          </Text>
        </SheetCard>

        <StatGrid
          style={{ marginTop: space.s16 }}
          items={[
            // Null where the venue's own order book would be needed. `compactMoney(null)`
            // would print "$0.0" and read as "no interest" rather than "not knowable".
            {
              label: 'Open interest',
              value: m?.openInterestUsd != null ? compactMoney(m.openInterestUsd) : '—',
            },
            { label: '24h volume', value: m?.dayVolumeUsd != null ? compactMoney(m.dayVolumeUsd) : '—' },
            { label: 'Mark vs index', value: m ? money(m.markVsIndex, { signed: true }) : '—' },
            { label: 'Next funding', value: m ? countdown(fundingIn) : '—' },
          ]}
        />
      </Fill>

      <ButtonPair
        style={{ marginTop: space.s14 }}
        left={
          <Button
            label="Short"
            variant="secondary"
            onPress={() => router.push(`/order/${symbol}?side=sell`)}
          />
        }
        right={
          <Button
            label="Long"
            backgroundColor={colors.goldFill}
            color={colors.goldInk}
            onPress={() => router.push(`/order/${symbol}?side=buy`)}
          />
        }
      />
    </Screen>
  );
}
