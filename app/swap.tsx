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
  BackButton,
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
import { MINUS, percent } from '@/format';
import { swapPct } from '@/state/derived';
import { usePrice } from '@/data/usePrices';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import { apiReason } from '@/data/api';
import { useSwapQuote } from '@/data/useSwapQuote';
import { useStore } from '@/state/store';
import { useRouter } from 'expo-router';

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
  const router = useRouter();
  const swapAmt = useStore((s) => s.swapAmt);
  const bumpSwap = useStore((s) => s.bumpSwap);
  // The order ticket works in dollars; the swap composes in units. Handed over on the way there.
  const setOrderAmt = useStore((s) => s.setOrderAmt);
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
  /*
   * You cannot swap what you do not hold — including when you hold none of it.
   *
   * This read `payHeld?.units`, so a wallet with no position in the pay token produced `undefined`
   * and the guard fell through: "Review swap" was enabled, on a real quote, for a wallet holding
   * zero. The check was written to mean "block when we know the balance and it is too small", and
   * treated a missing position as not knowing. A missing position IS knowing: it is zero.
   *
   * The distinction that actually matters is between "positions have not loaded yet" and "they
   * loaded and there is nothing" — the same absent-versus-not-yet line this app draws everywhere.
   * `positions.data` is undefined only in the first case, so that is what decides it.
   */
  const heldUnits = positions.data === undefined ? undefined : (payHeld?.units ?? 0);
  const overBalance = heldUnits !== undefined && swapAmt > heldUnits;
  /*
   * The third state, which the two lines above do not cover.
   *
   * `data === undefined` is "not loaded yet" OR "the load failed", and the comment above only
   * reasoned about the first. Found by interrupting this screen mid-load three times: the fetch
   * was abandoned, `data` stayed undefined, and the balance sat at an em dash indefinitely — never
   * wrong, which is the point of the dash, but never right either, and with no way to tell it apart
   * from a slow read. Worse quietly: `overBalance` needs `heldUnits`, so a failed read disables the
   * guard as a side effect and the screen goes silent about a check it is no longer making.
   */
  const balanceUnread = positions.data === undefined && positions.error !== undefined;

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
          <BackButton onPress={() => goBack()} />
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
            {/* Tappable only when there is something to retry — otherwise it is a label. */}
            <Press
              onPress={balanceUnread ? () => positions.reload() : undefined}
              accessibilityRole={balanceUnread ? 'button' : undefined}
              accessibilityLabel={balanceUnread ? `Retry reading your ${PAY} balance` : undefined}
            >
            <Text variant="footnote" color={colors.ink40}>
              {/*
                A dash while positions load, never a zero.

                This was `payHeld ? quantity(payHeld.units) : '0.0000'`, so for the second or two
                before the chain read returned — and on any read that failed — a funded wallet was
                told "Balance 0.0000" in the same weight as the real figure. Being confidently
                wrong about how much money someone has is the worst version of the not-yet-versus-
                nothing conflation, and this screen is where they decide how much to sell.

                `heldUnits` already distinguishes the three states for the guard below; the label
                uses the same one so the two can never disagree.
              */}
              {balanceUnread
                ? `Balance ${MINUS} · tap to retry`
                : `Balance ${heldUnits === undefined ? MINUS : quantity(heldUnits)}`}
            </Text>
            </Press>
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <View>
              {/*
                Four decimals, not zero.

                The pay amount steps from 0.01 to 10 WETH in increments of 0.05, and this rendered
                it with `decimals = 0` — so the screen's hero number read "0" for the default
                0.1 WETH, directly above "$248.40" and a quote for 247.86 USDC. A leftover from
                when this screen paid in SOL and the amounts were whole.
              */}
              <Price variant="amountLg">{quantity(swapAmt)}</Price>
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
                    : /*
                       * The venue's own reason, when it gave one.
                       *
                       * "No route available" was printed over the top of sentences like "No route
                       * for USDC -> WETH" and whatever 1inch said when it was the one refusing.
                       * A user who can see which pair failed knows to change something; one who
                       * cannot just taps again.
                       */
                      (apiReason(swap.error) ?? 'No route available')}
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
                {swap.data?.route ??
                  (swap.loading ? 'Finding…' : swap.error ? 'No venue would quote' : 'Unavailable')}
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
                {swap.data && swap.data.priceImpactPct !== null
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
                {percent(swap.data?.slippagePct ?? 0.3, { digits: 2, explicitSign: false })}
              </Price>
            }
            height={50}
            divider={false}
          />
        </View>
      </Fill>

      {/*
        This button did nothing. `onPress={() => goBack()}` — it reviewed nothing, swapped nothing
        and silently returned to the previous screen, so the whole of Swap was a dead end: compose
        an amount, read a real route and a real price impact, press the only primary control, and
        land back on Home with the trade unmade.

        Paying WETH to receive USDC is a sell of WETH, and this app already has one of those: the
        order ticket, which quotes it, caps it by the position, signs it and reports the fill. The
        composed amount is carried across in dollars, the unit the ticket works in. A second
        implementation of selling is exactly what `portfolio.close` exists to avoid.
      */}
      <Button
        label="Review swap"
        style={{ marginTop: space.s14 }}
        disabled={overBalance || payQuote?.price === undefined}
        onPress={() => {
          if (payQuote?.price === undefined) return;
          setOrderAmt(String(Math.max(1, Math.round(swapAmt * payQuote.price))));
          router.push(`/order/${PAY}?side=sell`);
        }}
      />
      {overBalance ? (
        <Text
          variant="footnote"
          color={colors.down}
          align="center"
          style={{ marginTop: space.s10 }}
        >
          {heldUnits === 0
            ? `You hold no ${PAY}. There is nothing to swap.`
            : `You hold ${quantity(heldUnits ?? 0)} ${PAY}.`}
        </Text>
      ) : balanceUnread ? (
        /* Says the check is not running, rather than letting its absence pass for a pass. */
        <Text
          variant="footnote"
          color={colors.ink40}
          align="center"
          style={{ marginTop: space.s10 }}
        >
          {`Your ${PAY} balance could not be read, so this is not being checked against it. The chain still refuses a swap larger than you hold.`}
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
