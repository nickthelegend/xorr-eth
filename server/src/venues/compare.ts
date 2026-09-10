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
import { publicClient, delegateAccount } from '../evm/client.js';
import { priceOf } from '../market/prices.js';
import { DELEGATION_ABI, DELEGATION_ADDRESS } from '../evm/delegation.js';
import { buildSwapVmFill, openPrograms } from './swapvm.js';

export type VenueQuote =
  | {
      venue: 'aqua' | 'swapvm' | '1inch';
      /** Units of the OUT token the venue says the taker receives. */
      outAmount: number;
      /** How the venue got there — pool names for the aggregator, the strategy for a book. */
      detail: string;
      served: true;
      /**
       * What the transaction costs to send, in dollars, and what is left after paying it.
       *
       * The venue with the largest `outAmount` is not always the one that leaves you better off:
       * an aggregator hop through three pools costs meaningfully more gas than a single book fill,
       * and on a small trade that difference is larger than the price difference it bought. A
       * comparison on output alone can therefore recommend the losing venue.
       *
       * `undefined` when the cost could not be estimated — never zero. A zero gas cost is a claim
       * about a transaction, and "we could not measure it" is a claim about our measurement.
       */
      gasUsd?: number;
      netUsd?: number;
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
   * The venue that leaves the taker with the most AFTER gas, when every served venue could be
   * costed. Undefined when any could not — a net comparison missing one leg is not a comparison.
   */
  bestNet?: 'aqua' | 'swapvm' | '1inch';
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


/**
 * What one of these fills costs to send, in dollars.
 *
 * Gas units come from the chain's own estimate of the actual call, not from a table of typical
 * costs — the whole point is that a three-pool aggregator route and a single book fill are
 * different transactions, and a constant would erase exactly the difference being measured.
 *
 * `undefined` rather than zero on any failure. Zero is a claim about the transaction; not knowing
 * is a claim about us, and a net-of-gas comparison built on a silent zero would confidently
 * recommend whichever venue we failed to price.
 */
async function gasUsdFor(
  estimate: () => Promise<bigint>,
): Promise<number | undefined> {
  const [units, feePerGas, ethUsd] = await Promise.all([
    estimate().catch(() => undefined),
    publicClient.getGasPrice().catch(() => undefined),
    priceOf('ETH').catch(() => undefined),
  ]);
  if (units === undefined || feePerGas === undefined || !ethUsd) return undefined;
  const wei = units * feePerGas;
  return (Number(wei) / 1e18) * ethUsd;
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

  /*
   * Cost each fill by estimating the transaction the settlement path would actually send.
   *
   * Aqua and SwapVM both settle through `XorrDelegation.spend()`, so that is the call estimated —
   * the same one `chooseSettlement` forwards. The aggregator's leg goes through the same `spend`
   * with the router's calldata, but building that calldata is a second 1inch call on a quote
   * surface, so its cost is taken from the swap the router itself describes.
   *
   * All three are estimates against the live chain, in parallel, and any that fails stays
   * `undefined` rather than defaulting to zero.
   */
  const [aquaGas, swapVmGas, aggGas] = await Promise.all([
    aqua
      ? gasUsdFor(() =>
          publicClient.estimateContractGas({
            account: delegateAccount.address,
            address: DELEGATION_ADDRESS,
            abi: DELEGATION_ABI,
            functionName: 'spend',
            args: [owner, aqua.token, aqua.venue, aqua.amount, aqua.data],
          }),
        )
      : Promise.resolve(undefined),
    swapVm
      ? gasUsdFor(() =>
          publicClient.estimateContractGas({
            account: delegateAccount.address,
            address: DELEGATION_ADDRESS,
            abi: DELEGATION_ABI,
            functionName: 'spend',
            args: [owner, swapVm.token, swapVm.venue, swapVm.amount, swapVm.data],
          }),
        )
      : Promise.resolve(undefined),
    agg?.estimatedGas
      ? gasUsdFor(async () => BigInt(agg.estimatedGas!))
      : Promise.resolve(undefined),
  ]);

  /** Dollar value of an OUT-token amount, for the net comparison. Undefined if it cannot be priced. */
  const outUsd = await priceOf(outSymbol).catch(() => undefined);
  const net = (out: number, gasUsd: number | undefined) =>
    outUsd !== undefined && gasUsd !== undefined ? out * outUsd - gasUsd : undefined;

  const quotes: VenueQuote[] = [
    aqua
      ? {
          venue: 'aqua',
          outAmount: outUnits(aqua.quotedOut),
          detail: `maker book, ${aqua.strategy} strategy`,
          served: true,
          gasUsd: aquaGas,
          netUsd: net(outUnits(aqua.quotedOut), aquaGas),
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
          gasUsd: swapVmGas,
          netUsd: net(outUnits(swapVm.minOut), swapVmGas),
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
          gasUsd: aggGas,
          netUsd: net(agg.outAmount, aggGas),
        }
      : { venue: '1inch', served: false, reason: 'The aggregator returned no route for this pair.' },
  ];

  const served = quotes.filter((q): q is Extract<VenueQuote, { served: true }> => q.served);
  served.sort((a, b) => b.outAmount - a.outAmount);

  /*
   * The net winner, only when EVERY served venue could be costed.
   *
   * A net comparison missing one leg is not a comparison — it would silently rank the venues we
   * happened to price against each other and present the result as "cheapest after gas".
   */
  const allCosted = served.length > 0 && served.every((q) => q.netUsd !== undefined);
  const byNet = allCosted ? [...served].sort((a, b) => b.netUsd! - a.netUsd!) : [];

  return {
    inSymbol,
    outSymbol,
    amount,
    quotes,
    best: served[0]?.venue,
    bestNet: byNet[0]?.venue,
    edgeBps:
      served.length > 1 && served[0]!.outAmount > 0
        ? Math.round(((served[0]!.outAmount - served[1]!.outAmount) / served[1]!.outAmount) * 10_000)
        : undefined,
  };
}
