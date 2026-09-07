/**
 * Screen 19 — Swap. screens.md Group B.
 *
 * Pay card (surface, radius 26): eyebrow + balance, 32/700 amount + USD line, token
 * selector pill, then a −/track/+ row. A 40pt swap circle with a 3pt solid black ring
 * OVERLAPS THE SEAM (margin −14, zIndex 2). Receive card mirrors it. Rows: Route / Fee /
 * Price impact / Max slippage.
 */
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { useGoBack } from '@/nav/useGoBack';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Icon } from '@/design/Icon';
import {
  Button,
  Eyebrow,
  Fill,
  IconButton,
  Press,
  Price,
  Row,
  Screen,
  Text,
  colors,
  duration,
  money,
  quantity,
  radius,
  size,
  space,
  timing,
  useReducedMotion,
} from '@/ui';
import { percent } from '@/format';
import { swapPct } from '@/state/derived';
import { usePrice } from '@/data/usePrices';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import { useSwapQuote } from '@/data/useSwapQuote';
import { useStore } from '@/state/store';

/** The pair the swap card opens on. Both must exist in server/src/venues/oneinch.ts TOKENS. */
const PAY = 'WETH';
const RECEIVE = 'USDC';

const CARD_PAD = space.s18;
const TRACK_H = 6;
/** The seam circle. 40pt with a 3pt ring in the screen background, pulled −14 into both cards. */
const SEAM = 40;
const SEAM_RING = 3;
const SEAM_PULL = -14;

export default function Swap() {
  const goBack = useGoBack();
  const swapAmt = useStore((s) => s.swapAmt);
  const bumpSwap = useStore((s) => s.bumpSwap);
  const reduced = useReducedMotion();
  // WETH, not SOL: this app settles on Base, and the pay side has to be a token the
  // delegation can actually route. Quoting a chain we do not trade would put a number on
  // screen that no signed transaction could ever match.
  const { quote: payQuote } = usePrice(PAY);
  // A real route from the aggregator: venues, minimum received and price impact are all
  // measured.
  const swap = useSwapQuote(PAY, RECEIVE, swapAmt);
  // The balance was hardcoded at 1,750.30. It is the real held quantity now.
  const positions = useAsync(() => repos.portfolio.positions(), []);
  const payHeld = (positions.data ?? []).find((p) => p.symbol === PAY);
  // You cannot swap what you do not hold. Without this the screen quoted 32 SOL against a
  // 0.2344 SOL balance with "Review swap" enabled — a route the venue would refuse, priced
  // and presented as if it were ready.
  const heldUnits = payHeld?.units;
  const overBalance = heldUnits !== undefined && swapAmt > heldUnits;

  const target = swapPct(swapAmt);
  const pct = useSharedValue(target);
  useEffect(() => {
    pct.value = withTiming(target, timing(duration.base, reduced));
  }, [target, reduced, pct]);
  const fill = useAnimatedStyle(() => ({ width: `${pct.value}%` }));

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s8 }}>
          <IconButton
            name="back"
            accessibilityLabel="Back"
            background="none"
            onPress={() => goBack()}
          />
          <Text variant="cardTitle">Swap</Text>
        </View>
        <IconButton name="gear" accessibilityLabel="Swap settings" />
      </View>

      <Fill style={{ marginTop: space.s22 }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: radius.panelXl,
            padding: CARD_PAD,
            gap: space.s12,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Eyebrow small>You pay</Eyebrow>
            <Text variant="footnote" color={colors.ink40}>
              Balance {payHeld ? quantity(payHeld.units) : '0.0000'}
            </Text>
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <View>
              <Price variant="amountLg">{quantity(swapAmt, 0)}</Price>
              <Text variant="secondarySm" style={{ marginTop: space.s4 }}>
                {payQuote?.price !== undefined ? money(swapAmt * payQuote.price) : 'No live price'}
              </Text>
            </View>
            <TokenPill symbol={PAY} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s12 }}>
            <StepCircle glyph="minus" onPress={() => bumpSwap(-1)} label="Decrease amount" />
            <View
              style={{
                flex: 1,
                height: TRACK_H,
                borderRadius: radius.full,
                backgroundColor: colors.control,
                overflow: 'hidden',
              }}
            >
              <Animated.View
                style={[
                  { height: TRACK_H, borderRadius: radius.full, backgroundColor: colors.ink },
                  fill,
                ]}
              />
            </View>
            <StepCircle glyph="plus" onPress={() => bumpSwap(1)} label="Increase amount" />
          </View>
        </View>

        {/* The circle overlapping the seam — the negative margin pulls both cards together. */}
        <View style={{ alignItems: 'center', marginVertical: SEAM_PULL, zIndex: 2 }}>
          <View
            style={{
              width: SEAM,
              height: SEAM,
              borderRadius: radius.full,
              backgroundColor: colors.control,
              borderWidth: SEAM_RING,
              borderColor: colors.bg,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="swap" size={18} color={colors.ink} />
          </View>
        </View>

        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: radius.panelXl,
            padding: CARD_PAD,
            gap: space.s12,
          }}
        >
          <Eyebrow small>You receive</Eyebrow>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <View>
              <Price variant="amountLg">{swap.data ? money(swap.data.outAmount) : '—'}</Price>
              <Text variant="secondarySm" style={{ marginTop: space.s4 }}>
                {swap.data
                  ? `at least ${money(swap.data.minimumOut)} after slippage`
                  : swap.loading
                    ? 'Getting a route…'
                    : 'No route available'}
              </Text>
            </View>
            <TokenPill symbol={RECEIVE} />
          </View>
        </View>

        <View style={{ marginTop: space.s18 }}>
          <Row
            title="Route"
            value={
              <Text variant="rowPrimary" color={colors.ink55}>
                {swap.data?.route ?? (swap.loading ? 'Finding…' : 'Unavailable')}
              </Text>
            }
            height={50}
          />
          <Row
            title="You receive at least"
            // The floor, not a fee: xorr charges none, and this is the number a user can hold
            // the fill against. See `SwapQuote.minimumOut`.
            value={
              <Price>
                {swap.data ? `${quantity(swap.data.minimumOut)} ${RECEIVE}` : '—'}
              </Price>
            }
            height={50}
          />
          <Row
            title="Price impact"
            value={
              <Price>
                {swap.data
                  ? percent(swap.data.priceImpactPct, { digits: 3, explicitSign: false })
                  : '—'}
              </Price>
            }
            height={50}
          />
          <Row
            title="Max slippage"
            value={
              <Price>
                {percent((swap.data?.slippageBps ?? 30) / 100, {
                  digits: 2,
                  explicitSign: false,
                })}
              </Price>
            }
            height={50}
            divider={false}
          />
        </View>
      </Fill>

      <Button
        label="Review swap"
        style={{ marginTop: space.s14 }}
        disabled={overBalance}
        onPress={() => goBack()}
      />
      {overBalance ? (
        <Text
          variant="footnote"
          color={colors.down}
          align="center"
          style={{ marginTop: space.s10 }}
        >
          {`You hold ${quantity(heldUnits ?? 0)} ${PAY}.`}
        </Text>
      ) : null}
    </Screen>
  );
}

function TokenPill({ symbol }: { symbol: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.s6,
        height: 36,
        paddingHorizontal: space.s12,
        borderRadius: radius.card,
        backgroundColor: colors.control,
      }}
    >
      <Text variant="control">{symbol}</Text>
      <Icon name="chevron" size={11} color={colors.ink55} />
    </View>
  );
}

/** §7: a 26pt control grows its TOUCH area to 44, not its circle. `Press` does that. */
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
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitHeight={size.stepperCircle}
      hitWidth={size.stepperCircle}
      style={{
        width: size.stepperCircle,
        height: size.stepperCircle,
        borderRadius: radius.full,
        backgroundColor: colors.control,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={glyph} size={14} color={colors.ink} />
    </Press>
  );
}
