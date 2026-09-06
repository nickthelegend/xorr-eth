/**
 * Screen 14 — Order ticket. screens.md Group B. WHITE SHEET, radius 30 30 0 0.
 *
 * Title + close. Buy/Sell segmented on #F2F2F5. 52/700 amount + unit conversion (/88.32, 4dp).
 * Quick pills $100 / $500 / Max. 3x4 numeric keypad (56px rows, 24px glyphs), keys 1-9, '.', 0, backspace.
 * Fee row (0.1%). CTA "{side} ${amount} of SOL", #16C060 buy / #EF3B36 sell.
 * Footnote reflecting the live Auto Close settings.
 *
 * Keypad rules live in state.md and are implemented in state/derived.ts#keypadPress:
 * max 7 chars, one decimal point, backspace pops, a leading 0 is REPLACED.
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Icon } from '@/design/Icon';
import { Button, Screen, Segmented } from '@/design/components';
import { sheet } from '@/design/colors';
import { radius } from '@/design/space';
import { type } from '@/design/type';
import { money, percent } from '@/format';
import { orderCta, orderFee, slPnl, tpPnl } from '@/state/derived';
import { unitsFor, usePrice } from '@/data/usePrices';
import { useStore } from '@/state/store';
import { DEFAULT_BUY, isTradable } from '@/data/tradable';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];

export default function OrderTicket() {
  const { symbol = DEFAULT_BUY, side: sideParam } = useLocalSearchParams<{
    symbol: string;
    side?: string;
  }>();
  const router = useRouter();
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

  const amount = parseFloat(orderAmt || '0') || 0;
  // The conversion a user acts on must come from the market, not from a design constant.
  const { quote } = usePrice(symbol);

  return (
    <Screen background={sheet.bg} sheetEdge gutter={false}>
      <View style={{ paddingHorizontal: 20, flex: 1 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text style={[type.sheetTitle, { color: sheet.ink }]}>{symbol}</Text>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={12}
          >
            <Icon name="close" size={20} color={sheet.ink} />
          </Pressable>
        </View>

        <Segmented
          options={['Buy', 'Sell']}
          value={side === 'buy' ? 0 : 1}
          onChange={(i) => setSide(i === 0 ? 'buy' : 'sell')}
          variant="sheet"
          height={38}
          trackRadius={radius.md2}
          thumbRadius={radius.sm2}
          style={{ marginTop: 18 }}
          accessibilityLabel="Order side"
        />

        <View style={{ alignItems: 'center', marginTop: 26, gap: 6 }}>
          <Text style={[type.heroAmount, { color: sheet.ink }]}>${orderAmt}</Text>
          <Text style={[type.body, { color: sheet.muted }]}>{unitsFor(amount, quote, symbol)}</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 20, justifyContent: 'center' }}>
          {(['$100', '$500', 'Max'] as const).map((q) => (
            <Pressable
              key={q}
              accessibilityRole="button"
              accessibilityLabel={`Set amount ${q}`}
              onPress={() => setOrderAmt(q === 'Max' ? '4862' : q.slice(1))}
              style={({ pressed }) => ({
                height: 34,
                paddingHorizontal: 16,
                borderRadius: radius.lg2,
                backgroundColor: sheet.fill,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={[type.pill, { color: sheet.ink }]}>{q}</Text>
            </Pressable>
          ))}
        </View>

        <Screen.Content style={{ marginTop: 12, justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {KEYS.map((k) => (
              <Pressable
                key={k}
                onPress={() => pressKey(k)}
                accessibilityRole="button"
                accessibilityLabel={k === '⌫' ? 'Delete' : k}
                style={({ pressed }) => ({
                  width: '33.333%',
                  height: 56,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: radius.md,
                  backgroundColor: pressed ? sheet.fill : 'transparent',
                })}
              >
                <Text style={{ fontSize: 24, fontWeight: '500', color: sheet.ink }}>{k}</Text>
              </Pressable>
            ))}
          </View>
        </Screen.Content>

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            paddingVertical: 12,
          }}
        >
          <Text style={[type.secondaryMd, { color: sheet.muted }]}>Fee (0.1%)</Text>
          <Text style={[type.secondaryMd, { color: sheet.ink }]}>{money(orderFee(amount))}</Text>
        </View>

        {/*
          An order ticket for something this chain cannot settle is a ticket that can never be
          filled. The asset screen already refuses to offer a Buy for one; the ticket itself was
          still reachable directly and happily said "Buy $250 of NOPE".
        */}
        {tradable ? (
          <Button
            label={orderCta(side, orderAmt, symbol)}
            variant={side === 'buy' ? 'buy' : 'sell'}
            onPress={() => router.back()}
          />
        ) : (
          <View style={{ paddingVertical: 14, alignItems: 'center' }}>
            <Text style={[type.secondaryMd, { color: sheet.muted, textAlign: 'center' }]}>
              {`${symbol} cannot be settled on Base, so there is no order to place.`}
            </Text>
          </View>
        )}

        {/* A promise about an order that cannot be placed is worse than saying nothing. */}
        {tradable ? (
          <Text style={[type.footnote, { color: sheet.dim, textAlign: 'center', marginTop: 12 }]}>
            {`Auto Close is on: TP ${percent(tp)} / SL ${percent(sl)} — make ${money(tpPnl(tp))} or lose ${money(slPnl(sl))}`}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}
