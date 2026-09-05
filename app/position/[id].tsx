/**
 * Screen 22 — Position & close. screens.md Group B.
 *
 * Mark + "BTC long" + "2x lev" chip. Eyebrow + P&L 46/700 in `up`, "+4.2% on $7,600 notional".
 * Stat card: Entry / Mark / Liquidation (down) / Funding paid (U+2212).
 * Close card: percentage + a 6px fill bar + 25/50/75/100 pills + "Realises X and frees Y of margin."
 * Edit TP/SL (flex:1) / "Close {n}%" (flex:1.3, white).
 */
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import {
  AssetMark,
  Button,
  ButtonRow,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingRows,
  Pill,
  Row,
  Screen,
  ScreenHeader,
  SheetCard,
  SimulatedTag,
} from '@/design/components';
import { ink, pnl, surfaces } from '@/design/colors';
import { DURATION } from '@/design/motion';
import { EASING } from '@/design/easing';
import { radius } from '@/design/space';
import { type } from '@/design/type';
import { motionDuration, useReducedMotion } from '@/design/useReducedMotion';
import { money, percent, price as fmtPrice, quantity, signedMoney } from '@/format';
import { CLOSE_STEPS, closeCta } from '@/state/derived';
import { useStore } from '@/state/store';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';

export default function PositionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const closePct = useStore((s) => s.closePct);
  const setClosePct = useStore((s) => s.setClosePct);
  const reduced = useReducedMotion();

  // Every figure below comes from the position book, valued at the live mark. The handoff's
  // entry $63,880 / mark $66,560 / liquidation $58,110 were design values with nothing behind them.
  const { data: p, loading, error, reload } = useAsync(() => repos.portfolio.position(id!), [id]);

  const realise = p ? (p.unrealised * closePct) / 100 : 0;
  const free = p ? (p.margin * closePct) / 100 : 0;

  const fill = useAnimatedStyle(() => ({
    width: withTiming(`${closePct}%`, {
      duration: motionDuration(DURATION.base, reduced),
      easing: EASING,
    }),
  }));

  if (loading && !p) {
    return (
      <Screen>
        <LoadingRows count={4} height={60} />
      </Screen>
    );
  }
  if (error) {
    return (
      <Screen>
        <ErrorState error={error} onRetry={reload} />
      </Screen>
    );
  }
  if (!p) {
    return (
      <Screen>
        <ScreenHeader
          left={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <IconButton
                name="back"
                accessibilityLabel="Back"
                background="transparent"
                color={ink.i55}
                onPress={() => router.back()}
              />
              <Text style={[type.screenTitle, { color: ink.full }]}>Position</Text>
            </View>
          }
        />
        <EmptyState text="You have no open positions." />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        left={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <IconButton
              name="back"
              accessibilityLabel="Back"
              background="transparent"
              color={ink.i55}
              onPress={() => router.back()}
            />
            <AssetMark gradient={{ c1: '#F7931A', c2: '#B96908' }} size={26} />
            <Text style={[type.cardTitleSm, { color: ink.full }]}>
              {p.symbol} {p.side}
            </Text>
            {p.leverage > 1 ? (
              <View
                style={{
                  backgroundColor: surfaces.surfaceAlt,
                  borderRadius: radius.xs2,
                  paddingHorizontal: 7,
                  paddingVertical: 3,
                }}
              >
                <Text style={[type.tagSm, { color: ink.i55 }]}>{p.leverage}x lev</Text>
              </View>
            ) : null}
          </View>
        }
        right={p.feed === 'unavailable' ? <SimulatedTag label="No feed" /> : undefined}
      />

      <View style={{ marginTop: 24, gap: 6 }}>
        <Text style={[type.eyebrowSm, { color: ink.i32 }]}>Unrealised</Text>
        <Text style={[type.pnlHero, { color: p.unrealised >= 0 ? pnl.up : pnl.down }]}>
          {signedMoney(p.unrealised)}
        </Text>
        <Text style={[type.body, { color: ink.i40 }]}>
          {percent(p.unrealisedPct)} on {money(p.notional)} held
        </Text>
      </View>

      <Screen.Content style={{ marginTop: 20 }}>
        <ScrollView showsVerticalScrollIndicator={false}>
        <SheetCard radius={radius.xl} padding={16}>
          <Row primary="Entry" value={fmtPrice(p.entry)} height={46} />
          <Row primary="Mark" value={fmtPrice(p.mark)} height={46} />
          <Row primary="Size" value={`${quantity(p.units)} ${p.symbol}`} height={46} />
          {p.liquidation > 0 ? (
            <Row
              primary="Liquidation"
              value={fmtPrice(p.liquidation)}
              valueColor={pnl.down}
              height={46}
            />
          ) : null}
          <Row
            primary="Funding paid"
            value={p.fundingPaid === 0 ? 'None — spot' : signedMoney(-p.fundingPaid)}
            valueColor={ink.i55}
            height={46}
            divider={false}
          />
        </SheetCard>

        <SheetCard radius={radius.xl} padding={16} style={{ marginTop: 14 }}>
          <View
            style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}
          >
            <Text style={[type.cardTitleSm, { color: ink.full }]}>Close</Text>
            <Text style={[type.statLarge, { color: ink.full }]}>{closePct}%</Text>
          </View>

          <View
            style={{
              height: 6,
              borderRadius: 3,
              backgroundColor: surfaces.control,
              marginTop: 12,
              overflow: 'hidden',
            }}
          >
            <Animated.View style={[{ height: 6, borderRadius: 3, backgroundColor: ink.full }, fill]} />
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
            {CLOSE_STEPS.map((step) => (
              <View key={step} style={{ flex: 1 }}>
                <Pill label={`${step}%`} selected={step === closePct} onPress={() => setClosePct(step)} />
              </View>
            ))}
          </View>

          <Text style={[type.noteBody, { color: ink.i45, marginTop: 14 }]}>
            Realises <Text style={{ color: ink.full, fontWeight: '600' }}>{signedMoney(realise)}</Text>{' '}
            and frees <Text style={{ color: ink.full, fontWeight: '600' }}>{money(free)}</Text>.
          </Text>
        </SheetCard>
        </ScrollView>
      </Screen.Content>

      <ButtonRow
        style={{ marginTop: 14 }}
        secondary={
          <Button
            label="Edit TP/SL"
            variant="secondary"
            onPress={() => router.push(`/auto-close/${p.id}`)}
          />
        }
        affirmative={<Button label={closeCta(closePct)} />}
      />
    </Screen>
  );
}
