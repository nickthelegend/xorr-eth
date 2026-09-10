/**
 * Which pools a fill would actually go through, at a size you choose.
 *
 * The order ticket shows the route as one line because that is all it has room for, and the route
 * is the part of a swap that decides what you pay. Size changes it — a hundred dollars and five
 * thousand dollars take different paths through different venues — and there was nowhere to see
 * that happen.
 *
 * This is a quote, not an order. It calls the same endpoint the ticket calls and places nothing.
 *
 * The size steps rather than free-types. The interesting thing here is how the route CHANGES across
 * sizes, and a text field invites someone to type one number and learn nothing.
 */
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useGoBack } from '@/nav/useGoBack';
import {
  ErrorState,
  Fill,
  HeaderBar,
  Pill,
  PillRow,
  Placeholder,
  Screen,
  SheetCard,
  Text,
  colors,
  radius,
  space,
} from '@/ui';
import { money, percent, quantity } from '@/format';
import { useSwapQuote } from '@/data/useSwapQuote';
import { useAsync } from '@/data/useAsync';
import { system } from '@/data/system';
import { settlementSymbol } from '@/data/tradable';

/**
 * What a buy pays with. The executor settles every purchase out of USDC, so quoting from anything
 * else here would price a route the bot would never take.
 */
const PAYS_WITH = 'USDC';

/** Sizes chosen to straddle where routing usually changes, not to be round for their own sake. */
const SIZES = [100, 500, 2_500, 10_000] as const;

export default function RouteInspector() {
  const goBack = useGoBack();
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const [usd, setUsd] = useState<number>(SIZES[1]);

  /*
   * The token the symbol actually settles as. Asking for a route into "BTC" would quote a market
   * this chain does not have; the buy is cbBTC, and that is what the router is asked about.
   */
  const into = settlementSymbol(symbol ?? '');
  const { data, loading, error } = useSwapQuote(PAYS_WITH, into, usd);

  return (
    <Screen gutter="none">
      <View style={{ paddingHorizontal: space.gutter }}>
        <HeaderBar onBack={goBack} title={<Text variant="screenTitle">Route</Text>} />
        <Text variant="secondary" color={colors.ink40} style={{ marginTop: space.s8 }}>
          {PAYS_WITH} into {into}, quoted live. Nothing here places an order.
        </Text>
      </View>

      <PillRow style={{ marginTop: space.s14 }} contentPadding={space.gutter}>
        {SIZES.map((s) => (
          <Pill key={s} label={money(s)} selected={s === usd} onPress={() => setUsd(s)} />
        ))}
      </PillRow>

      <Fill style={{ marginTop: space.s12, paddingHorizontal: space.gutter }}>
        {error ? (
          <ErrorState error={error} />
        ) : loading && !data ? (
          <Placeholder height={180} />
        ) : !data ? null : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: space.s30, gap: space.s10 }}
          >
            <SheetCard bordered borderRadius={radius.panel} padding={space.s18}>
              <Text variant="footnote" color={colors.ink40}>
                YOU WOULD RECEIVE
              </Text>
              <Text variant="screenTitle" style={{ marginTop: space.s6 }}>
                {quantity(data.outAmount)} {into}
              </Text>
              <Text variant="secondarySm" color={colors.ink40} style={{ marginTop: space.s8 }}>
                At worst {quantity(data.minimumOut)}, at {data.slippagePct}% slippage.
              </Text>
            </SheetCard>

            <SheetCard bordered borderRadius={radius.panel} padding={space.s14}>
              <Text variant="footnote" color={colors.ink40}>
                THROUGH
              </Text>
              {data.venues.length === 0 ? (
                <Text variant="secondarySm" color={colors.ink40} style={{ marginTop: space.s8 }}>
                  The router named no venues for this size.
                </Text>
              ) : (
                data.venues.map((v) => (
                  <Text key={v} variant="secondary" color={colors.ink65} style={{ marginTop: space.s8 }}>
                    {v}
                  </Text>
                ))
              )}
            </SheetCard>

            <SheetCard bordered borderRadius={radius.panel} padding={space.s14}>
              <Text variant="footnote" color={colors.ink40}>
                PRICE IMPACT
              </Text>
              {/*
                A dash where it cannot be measured, never a zero. Zero impact is a claim about the
                depth of a pool; "we could not measure it" is a claim about the quote.
              */}
              <Text variant="rowPrimary" style={{ marginTop: space.s4 }}>
                {data.priceImpactPct === null
                  ? '—'
                  : percent(data.priceImpactPct, { digits: 2, explicitSign: false })}
              </Text>
              <Text variant="footnote" color={colors.ink28} style={{ marginTop: space.s8 }}>
                {data.route}
              </Text>
            </SheetCard>

            {/*
              The other two venues, asked the same question.
              `settle.ts` chooses between Aqua, SwapVM and the aggregator in a documented order,
              and the trail names whichever filled — so "Aqua filled this" was a label with nothing
              behind it. What makes it a claim is what the others would have done, refusals
              included: a maker quotes what they hold, and "no book is deep enough at this size" is
              information rather than an absence.
            */}
            <VenueComparison inSymbol={PAYS_WITH} outSymbol={into} amount={usd} />
          </ScrollView>
        )}
      </Fill>
    </Screen>
  );
}

/** How each venue is named on screen. The trail uses the same words. */
const VENUE_LABEL: Record<string, string> = {
  aqua: '1inch Aqua',
  swapvm: '1inch SwapVM',
  '1inch': '1inch Aggregation',
};

function VenueComparison({
  inSymbol,
  outSymbol,
  amount,
}: {
  inSymbol: string;
  outSymbol: string;
  amount: number;
}) {
  const { data, loading, error } = useAsync(
    () => system.routeCompare(inSymbol, outSymbol, amount),
    [inSymbol, outSymbol, amount],
  );

  /*
   * A failed comparison is silent rather than an error state.
   *
   * The quote above it is the answer the user came for and is already on screen; turning a
   * secondary panel's failure into a screen-level error would replace working content with a
   * retry button. It reappears on its own when the call succeeds.
   */
  if (error) return null;
  if (loading && !data) return <Placeholder height={140} />;
  if (!data) return null;

  return (
    <SheetCard bordered borderRadius={radius.panel} padding={space.s14}>
      <Text variant="footnote" color={colors.ink40}>
        EVERY VENUE, SAME SIZE
      </Text>
      {data.quotes.map((q) => (
        <View key={q.venue} style={{ marginTop: space.s10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.s10 }}>
            <Text
              variant="secondary"
              color={q.venue === data.best ? colors.up : colors.ink65}
              style={{ flexShrink: 1 }}
            >
              {VENUE_LABEL[q.venue] ?? q.venue}
            </Text>
            <Text variant="secondary" color={q.served ? colors.ink : colors.ink28}>
              {q.served ? `${quantity(q.outAmount)} ${outSymbol}` : 'cannot serve'}
            </Text>
          </View>
          <Text variant="footnote" color={colors.ink28} style={{ marginTop: space.s2 }}>
            {q.served ? q.detail : q.reason}
          </Text>
          {/*
            What it costs to send, and what is left after paying it.
            The venue with the largest output is not always the one that leaves you better off: an
            aggregator hop through three pools is a more expensive transaction than a single book
            fill, and on a small trade that gap can be larger than the price it bought. Absent
            rather than zero when the cost could not be estimated — free is a claim.
          */}
          {q.served && q.gasUsd !== undefined ? (
            <Text variant="footnote" color={colors.ink28}>
              {`gas ${money(q.gasUsd, { fractionDigits: 4 })}${q.netUsd !== undefined ? ` · net ${money(q.netUsd)}` : ''}`}
            </Text>
          ) : null}
        </View>
      ))}
      {/*
        The margin, only when there was something to beat. `edgeBps` is deliberately absent when a
        single venue answered, because "0 bps better" reads as a tie rather than as no competition.
      */}
      {/* Said only when it differs — otherwise it is the same sentence twice. */}
      {data.bestNet && data.best && data.bestNet !== data.best ? (
        <Text variant="footnote" color={colors.up} style={{ marginTop: space.s10 }}>
          {`${VENUE_LABEL[data.bestNet] ?? data.bestNet} wins after gas, even though ${VENUE_LABEL[data.best] ?? data.best} quotes more.`}
        </Text>
      ) : null}
      <Text variant="footnote" color={colors.ink40} style={{ marginTop: space.s12 }}>
        {data.edgeBps !== undefined
          ? `${VENUE_LABEL[data.best ?? ''] ?? data.best} wins by ${data.edgeBps} bps.`
          : data.best
            ? `Only ${VENUE_LABEL[data.best] ?? data.best} can serve this size, so there is nothing to compare it against.`
            : 'No venue can serve this size right now.'}
      </Text>
    </SheetCard>
  );
}
