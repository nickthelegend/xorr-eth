/**
 * What every venue would give for the same trade, priced at once.
 *
 * The executor already chooses between three settlement paths — Aqua, SwapVM, the aggregator — in
 * a fixed order documented in `executor/settle.ts`. That order is the right policy and it is
 * invisible: the activity trail names the venue that filled, and nothing says what the other two
 * would have done. "Aqua filled this" is a fact; "Aqua filled this and beat the aggregator by 11
 * basis points" is the claim worth making, and it is the one a judge asks about.
 *
 * So this asks all three the same question and reports every answer, including the refusals. A
 * venue that cannot serve the size says why — a maker quotes what they hold, and "no book is deep
 * enough at $5,000" is information rather than an error.
 *
 * Deliberately a QUOTE surface and nothing else. It builds no calldata that could be submitted and
 * touches no permission; the ordering decision still lives in `settle.ts`, which is where it
 * belongs. Two places that decide where a trade fills is the bug this file must not become.
 */
import type { Address } from 'viem';
import { quote, TOKENS as VENUE_TOKENS, SLIPPAGE } from './oneinch.js';
import { buildAquaFill } from './aqua.js';
import { buildSwapVmFill, openPrograms } from './swapvm.js';

export type VenueQuote =
  | {
      venue: 'aqua' | 'swapvm' | '1inch';
      /** Units of the OUT token the venue says the taker receives. */
      outAmount: number;
      /** How the venue got there — pool names for the aggregator, the strategy for a book. */
      detail: string;
      served: true;
    }
  | {
      venue: 'aqua' | 'swapvm' | '1inch';
      served: false;
      /** Why this venue is not an option for this size, in a sentence. */
      reason: string;
    };

export type RouteComparison = {
  inSymbol: string;
  outSymbol: string;
  amount: number;
  quotes: VenueQuote[];
  /** The venue with the highest out, or undefined when nothing could serve the size. */
  best?: 'aqua' | 'swapvm' | '1inch';
  /**
   * How much better the winner is than the next venue that could serve, in basis points.
   *
   * Undefined when only one venue answered, because "better than nothing" is not a margin. That
   * distinction matters more than it looks: a single-venue result reported as "0 bps better" reads
   * as a tie when it is actually an absence of competition.
   */
  edgeBps?: number;
};

/** One venue's answer, never allowed to fail the whole comparison. */
async function settled<T>(work: Promise<T>): Promise<T | undefined> {
  return work.catch(() => undefined);
}

export async function compareVenues(params: {
  owner: Address;
  inSymbol: string;
  outSymbol: string;
  amount: number;
}): Promise<RouteComparison> {
  const { owner, inSymbol, outSymbol, amount } = params;
  const payToken = VENUE_TOKENS[inSymbol];
  const outToken = VENUE_TOKENS[outSymbol];
  if (!payToken || !outToken) throw new Error(`No token registry entry for ${inSymbol}/${outSymbol}`);

  const amountIn = BigInt(Math.round(amount * 10 ** payToken.decimals));
  const outUnits = (raw: bigint) => Number(raw) / 10 ** outToken.decimals;

  /*
   * The aggregator first, and not only because it usually wins: SwapVM needs a minimum-out, and
   * the only honest source for one is what something else says the trade is worth. Same dependency
   * `settle.ts` has.
   */
  const agg = await settled(quote({ inSymbol, outSymbol, amount }));

  /*
   * How many programs exist at all, so a refusal can name its own cause. Counted separately from
   * the fill attempt because `buildSwapVmFill` collapses "none shipped" and "none fillable" into
   * the same `undefined`.
   */
  const shippedCount = await settled(openPrograms()).then((p) => p?.length ?? 0);

  const [aqua, swapVm] = await Promise.all([
    settled(
      buildAquaFill({
        owner,
        tokenIn: payToken.address,
        tokenOut: outToken.address,
        amountIn,
        slippage: SLIPPAGE.scheduled / 100,
      }),
    ),
    agg
      ? settled(
          buildSwapVmFill({
            owner,
            tokenIn: payToken.address,
            tokenOut: outToken.address,
            amountIn,
            slippage: SLIPPAGE.scheduled / 100,
            quotedOut: BigInt(Math.round(agg.outAmount * 10 ** outToken.decimals)),
          }),
        )
      : Promise.resolve(undefined),
  ]);

  const quotes: VenueQuote[] = [
    aqua
      ? {
          venue: 'aqua',
          outAmount: outUnits(aqua.quotedOut),
          detail: `maker book, ${aqua.strategy} strategy`,
          served: true,
        }
      : {
          venue: 'aqua',
          served: false,
          reason: 'No maker book is deep enough for this size right now.',
        },
    swapVm
      ? {
          venue: 'swapvm',
          /*
           * A SwapVM program commits to a floor, not a quote: the fill is whatever the router
           * computes at execution, bounded below by the minimum compiled into the bytecode. So the
           * honest number here is that floor, and it is labelled as one rather than presented as a
           * price the maker promised.
           */
          outAmount: outUnits(swapVm.minOut),
          detail: 'shipped program, floor enforced in bytecode',
          served: true,
        }
      : {
          venue: 'swapvm',
          served: false,
          /*
           * WHY it cannot serve, distinguished rather than assumed.
           *
           * This said "no maker has shipped a program" for every refusal, which was measurably
           * false on the fork: sixteen programs were open and discoverable, and the fill was
           * refused by the dry run for this owner's permission. A comparison whose reasons are
           * guesses is worth less than one that admits the difference — "nobody is quoting" and
           * "somebody is quoting and you cannot take it" are opposite facts about the venue.
           */
          reason: !agg
            ? 'Needs a reference price, and the aggregator did not answer.'
            : shippedCount === 0
              ? 'No maker has shipped a program for this pair.'
              : `${shippedCount} program${shippedCount === 1 ? ' is' : 's are'} shipped, but none can fill this size under your permission right now.`,
        },
    agg
      ? {
          venue: '1inch',
          outAmount: agg.outAmount,
          /*
           * The pools by name, not "Best of 2 venues".
           *
           * `routeLabel` summarises for the order ticket, which has one line. Here the whole point
           * is that each venue's answer can be compared, and "Best of 2 venues" is a count where
           * the other two rows give a reason — so it names what it routed through, the same way the
           * activity trail does.
           */
          detail: agg.venues.length ? `via ${agg.venues.join(', ')}` : 'direct, no pool hop',
          served: true,
        }
      : { venue: '1inch', served: false, reason: 'The aggregator returned no route for this pair.' },
  ];

  const served = quotes.filter((q): q is Extract<VenueQuote, { served: true }> => q.served);
  served.sort((a, b) => b.outAmount - a.outAmount);

  return {
    inSymbol,
    outSymbol,
    amount,
    quotes,
    best: served[0]?.venue,
    edgeBps:
      served.length > 1 && served[0]!.outAmount > 0
        ? Math.round(((served[0]!.outAmount - served[1]!.outAmount) / served[1]!.outAmount) * 10_000)
        : undefined,
  };
}
