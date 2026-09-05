/**
 * Screen 19 — Swap. screens.md Group B.
 *
 * Pay card (surface, radius 26): eyebrow + balance, 32/700 amount + USD line, token selector pill,
 * then a -/track/+ row. A 40px swap circle with a 3px solid #000 ring OVERLAPS THE SEAM
 * (margin -14 0, zIndex 2). Receive card mirrors it. Rows: Route / Fee / Max slippage 0.30%.
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Icon } from '@/design/Icon';
import { Button, IconButton, Row, Screen, ScreenHeader } from '@/design/components';
import { ink, surfaces } from '@/design/colors';
import { DURATION } from '@/design/motion';
import { EASING } from '@/design/easing';
import { radius, MIN_HIT } from '@/design/space';
import { type } from '@/design/type';
import { motionDuration, useReducedMotion } from '@/design/useReducedMotion';
import { money, percent, quantity } from '@/format';
import { swapPct } from '@/state/derived';
import { usePrice } from '@/data/usePrices';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import { useSwapQuote } from '@/data/useSwapQuote';
import { useStore } from '@/state/store';

export default function Swap() {
  const router = useRouter();
  const swapAmt = useStore((s) => s.swapAmt);
  const bumpSwap = useStore((s) => s.bumpSwap);
  const reduced = useReducedMotion();
  const { quote: solQuote } = usePrice('SOL');
  // A real route from the aggregator: venues, minimum received and price impact are all measured.
  const swap = useSwapQuote('SOL', 'USDC', swapAmt);
  // The balance was hardcoded at 1,750.30. It is the real held quantity now.
  const positions = useAsync(() => repos.portfolio.positions(), []);
  const solHeld = (positions.data ?? []).find((p) => p.symbol === 'SOL');

  const fill = useAnimatedStyle(() => ({
    width: withTiming(`${swapPct(swapAmt)}%`, {
      duration: motionDuration(DURATION.base, reduced),
      easing: EASING,
    }),
  }));

  return (
    <Screen>
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
            <Text style={[type.cardTitleSm, { color: ink.full }]}>Swap</Text>
          </View>
        }
        right={<IconButton name="gear" accessibilityLabel="Swap settings" />}
      />

      <Screen.Content style={{ marginTop: 22 }}>
        <View
          style={{
            backgroundColor: surfaces.surface,
            borderRadius: radius.xl3,
            padding: 18,
            gap: 12,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={[type.eyebrowSm, { color: ink.i32 }]}>You pay</Text>
            <Text style={[type.footnote, { color: ink.i40 }]}>
              Balance {solHeld ? quantity(solHeld.units) : '0.0000'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <Text style={[type.amountMedium, { color: ink.full }]}>{quantity(swapAmt, 0)}</Text>
              <Text style={[type.secondary, { color: ink.i38, marginTop: 4 }]}>
                {solQuote ? money(swapAmt * solQuote.price) : 'No live price'}
              </Text>
            </View>
            <TokenPill symbol="SOL" />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <StepCircle glyph="minus" onPress={() => bumpSwap(-1)} label="Decrease amount" />
            <View
              style={{
                flex: 1,
                height: 6,
                borderRadius: 3,
                backgroundColor: surfaces.control,
                overflow: 'hidden',
              }}
            >
              <Animated.View
                style={[{ height: 6, borderRadius: 3, backgroundColor: ink.full }, fill]}
              />
            </View>
            <StepCircle glyph="plus" onPress={() => bumpSwap(1)} label="Increase amount" />
          </View>
        </View>

        {/* The 40px circle overlapping the seam — margin -14 pulls both cards together. */}
        <View style={{ alignItems: 'center', marginVertical: -14, zIndex: 2 }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: surfaces.control,
              borderWidth: 3,
              borderColor: surfaces.bg,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="swap" size={18} color={ink.full} />
          </View>
        </View>

        <View
          style={{
            backgroundColor: surfaces.surface,
            borderRadius: radius.xl3,
            padding: 18,
            gap: 12,
          }}
        >
          <Text style={[type.eyebrowSm, { color: ink.i32 }]}>You receive</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <Text style={[type.amountMedium, { color: ink.full }]}>
                {swap.data ? money(swap.data.outAmount) : '—'}
              </Text>
              <Text style={[type.secondary, { color: ink.i38, marginTop: 4 }]}>
                {swap.data
                  ? `at least ${money(swap.data.minimumOut)} after slippage`
                  : swap.loading
                    ? 'Getting a route…'
                    : 'No route available'}
              </Text>
            </View>
            <TokenPill symbol="USDC" />
          </View>
        </View>

        <View style={{ marginTop: 18 }}>
          <Row
            primary="Route"
            value={swap.data?.route ?? (swap.loading ? 'Finding…' : 'Unavailable')}
            valueColor={ink.i55}
            height={50}
          />
          <Row
            primary="Fee (0.25%)"
            value={swap.data ? money(swap.data.feeUsd) : '—'}
            height={50}
          />
          <Row
            primary="Price impact"
            value={swap.data ? percent(swap.data.priceImpactPct, { digits: 3, explicitSign: false }) : '—'}
            height={50}
          />
          <Row
            primary="Max slippage"
            value={percent((swap.data?.slippageBps ?? 30) / 100, { digits: 2, explicitSign: false })}
            height={50}
            divider={false}
          />
        </View>
      </Screen.Content>

      <Button label="Review swap" style={{ marginTop: 14 }} onPress={() => router.back()} />
    </Screen>
  );
}

function TokenPill({ symbol }: { symbol: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 36,
        paddingHorizontal: 12,
        borderRadius: radius.lg2,
        backgroundColor: surfaces.control,
      }}
    >
      <Text style={[type.pill, { color: ink.full }]}>{symbol}</Text>
      <Icon name="chevron" size={11} color={ink.i55} />
    </View>
  );
}

function StepCircle({
  glyph,
  onPress,
  label,
}: {
  glyph: 'plus' | 'minus';
  onPress: () => void;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={(MIN_HIT - 26) / 2}
      style={({ pressed }) => ({
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: surfaces.control,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Icon name={glyph} size={14} color={ink.full} />
    </Pressable>
  );
}
