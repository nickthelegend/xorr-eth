/**
 * Screen 14 — Order ticket. screens.md Group B. WHITE SHEET, radius 30 30 0 0.
 *
 * Title + close. Buy/Sell segmented on `sheet.fill`. 52/700 amount + unit conversion.
 * Quick pills $100 / $500 / Max. 3×4 numeric keypad. Fee row (0.1%). CTA
 * "{side} ${amount} of SOL" in `candleUp` / `candleDown`. Footnote reflecting the live
 * Auto Close settings.
 *
 * Keypad rules live in state.md and are implemented in state/derived.ts#keypadPress:
 * max 7 chars, one decimal point, backspace pops, a leading 0 is REPLACED.
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Button,
  Fill,
  IconButton,
  Keypad,
  Pill,
  Price,
  Screen,
  Segmented,
  Text,
  colors,
  money,
  percent,
  quantity,
  size,
  space,
} from '@/ui';
import { orderCta, orderFee, slPnl, tpPnl } from '@/state/derived';
import { unitsFor, usePrice } from '@/data/usePrices';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import { useStore } from '@/state/store';
import { DEFAULT_BUY, isTradable } from '@/data/tradable';

type Side = 'buy' | 'sell';

const SIDES = [
  { value: 'buy', label: 'Buy' },
  { value: 'sell', label: 'Sell' },
] as const satisfies readonly { value: Side; label: string }[];

const QUICK = ['$100', '$500', 'Max'] as const;

export default function OrderTicket() {
  const { symbol = DEFAULT_BUY, side: sideParam } = useLocalSearchParams<{
    symbol: string;
    side?: string;
  }>();
  const router = useRouter();
  // An order ticket for something this chain cannot settle is a ticket that can never be
  // filled. The asset screen already refuses to offer a Buy for one; the ticket itself was
  // still reachable directly and happily said "Buy $250 of NOPE".
  const tradable = isTradable(symbol);

  const orderAmt = useStore((s) => s.orderAmt);
  const pressKey = useStore((s) => s.pressKey);
  const setOrderAmt = useStore((s) => s.setOrderAmt);
  const side = useStore((s) => s.side);
  const setSide = useStore((s) => s.setSide);
  const tp = useStore((s) => s.tp);
  const sl = useStore((s) => s.sl);

  React.useEffect(() => {
    if (sideParam === 'buy' || sideParam === 'sell') setSide(sideParam);
  }, [sideParam, setSide]);

  // The bot can only trade what has settled, so the ticket has to know the balance. "Max"
  // used to be the string '4862' — the handoff's design total — which was both a hardcoded
  // number and the wrong one, and nothing stopped a user composing an order past their
  // holdings.
  const { data: bal } = useAsync(() => repos.wallet.balance(), []);
  const availableUsd = bal?.usd;

  // A SELL is not a spend. It reduces a position the user already holds, so what caps it is
  // the position, not the balance — and it goes through the same close path screen 22 uses
  // rather than a second implementation of selling.
  const { data: positions } = useAsync(() => repos.portfolio.positions(), []);
  const held = (positions ?? []).find((p) => p.symbol === symbol);
  const heldUsd = held?.notional;

  const amount = parseFloat(orderAmt || '0') || 0;
  const ceiling = side === 'buy' ? availableUsd : heldUsd;
  const overBalance = ceiling !== undefined && amount > ceiling;

  // The conversion a user acts on must come from the market, not from a design constant.
  const { quote } = usePrice(symbol);

  const [placing, setPlacing] = useState(false);
  const [refusal, setRefusal] = useState<string>();
  const [filled, setFilled] = useState<{ units: number; price: number }>();

  async function place() {
    if (amount <= 0 || placing) return;
    setPlacing(true);
    setRefusal(undefined);
    try {
      if (side === 'sell') {
        if (!held || !heldUsd) {
          setRefusal(`You do not hold any ${symbol}.`);
          return;
        }
        // A USD amount, expressed as the fraction of the holding it represents — which is
        // what the executor needs to compute an exact on-chain balance to sell.
        const res = await repos.portfolio.close({
          symbol,
          fraction: Math.min(1, amount / heldUsd),
        });
        if (res.status === 'closed') {
          setFilled({ units: res.units ?? 0, price: (res.usd ?? 0) / (res.units || 1) });
          setTimeout(() => router.back(), 1200);
        } else {
          setRefusal(res.detail ?? res.error ?? `The sale came back "${res.status}".`);
        }
        return;
      }

      const res = await repos.orders.place({ symbol, usd: amount });
      if (res.status === 'filled') {
        setFilled({ units: res.units ?? 0, price: res.price ?? 0 });
        // Let the fill land on screen before the sheet goes; a ticket that closes the
        // instant you tap it leaves you unsure whether anything happened.
        setTimeout(() => router.back(), 1200);
      } else {
        // The policy engine's own sentence — "the daily cap is spent", not "409".
        // The policy engine's own sentence — "the daily cap is spent", not "409".
        setRefusal(res.detail ?? res.reason ?? res.error ?? `The order came back "${res.status}".`);
      }
    } catch (e) {
      setRefusal(e instanceof Error ? e.message : String(e));
    } finally {
      setPlacing(false);
    }
  }

  return (
    <Screen light gutter="sheet">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="sheetTitle" color={colors.sheet.ink}>
          {symbol}
        </Text>
        <IconButton
          name="close"
          accessibilityLabel="Close"
          onPress={() => router.back()}
          background="none"
          color={colors.sheet.ink}
          glyph={20}
        />
      </View>

      <Segmented
        options={SIDES}
        value={side}
        onChange={setSide}
        light
        height={size.segThumb}
        style={{ marginTop: space.s18 }}
      />

      <View style={{ alignItems: 'center', marginTop: space.s26, gap: space.s6 }}>
        <Price variant="heroAmount" color={colors.sheet.ink}>
          ${orderAmt}
        </Price>
        <Text variant="body" color={colors.sheet.muted}>
          {unitsFor(amount, quote, symbol)}
        </Text>
      </View>

      <View
        style={{
          flexDirection: 'row',
          gap: space.s8,
          marginTop: space.s20,
          justifyContent: 'center',
        }}
      >
        {QUICK.map((q) => (
          <Pill
            key={q}
            label={q}
            light
            onPress={() =>
              setOrderAmt(
                q === 'Max'
                  ? availableUsd === undefined
                    ? ''
                    : String(Math.floor(availableUsd))
                  : q.slice(1),
              )
            }
          />
        ))}
      </View>

      <Fill style={{ marginTop: space.s12, justifyContent: 'center' }}>
        <Keypad light onPress={pressKey} />
      </Fill>

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingVertical: space.s12,
        }}
      >
        <Text variant="secondary" color={colors.sheet.muted}>
          Fee (0.1%)
        </Text>
        <Price variant="secondary" color={colors.sheet.ink}>
          {money(orderFee(amount))}
        </Price>
      </View>

      {tradable ? (
        <Button
          label={
            filled
              ? `${side === 'buy' ? 'Bought' : 'Sold'} ${quantity(filled.units)} ${symbol}`
              : orderCta(side, orderAmt, symbol)
          }
          backgroundColor={side === 'buy' ? colors.candleUp : colors.candleDown}
          color={colors.ink}
          disabled={overBalance || amount <= 0 || filled !== undefined}
          loading={placing}
          onPress={place}
        />
      ) : (
        <View style={{ paddingVertical: space.s14, alignItems: 'center' }}>
          <Text variant="secondary" color={colors.sheet.muted} align="center">
            {`${symbol} cannot be settled on Base, so there is no order to place.`}
          </Text>
        </View>
      )}
      {refusal ? (
        <Text
          variant="footnote"
          color={colors.down}
          align="center"
          style={{ marginTop: space.s10 }}
        >
          {refusal}
        </Text>
      ) : null}
      {overBalance ? (
        <Text
          variant="footnote"
          color={colors.down}
          align="center"
          style={{ marginTop: space.s10 }}
        >
          {side === 'buy'
            ? `That is more than the ${money(availableUsd ?? 0)} you have settled.`
            : `You hold ${money(heldUsd ?? 0)} of ${symbol}.`}
        </Text>
      ) : null}

      {/* A promise about an order that cannot be placed is worse than saying nothing. */}
      {tradable ? (
        <Text
          variant="footnote"
          color={colors.sheet.dim}
          align="center"
          style={{ marginTop: space.s12 }}
        >
          {`Auto Close is on: TP ${percent(tp)} / SL ${percent(sl)} — make ${money(tpPnl(tp))} or lose ${money(slPnl(sl))}`}
        </Text>
      ) : null}
    </Screen>
  );
}
