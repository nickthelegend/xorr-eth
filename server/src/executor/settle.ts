/**
 * Which venue settles this leg, and the exact call that does it.
 *
 * Split out of `run.ts`, which had grown back to 1,058 lines as venues were added — and venue
 * selection is the part that kept growing. `run.ts` is about a run: claim the period, check the
 * gates, send, measure, write the book. WHERE a trade fills is a separate question with its own
 * ordering rules, and it now has a file where those rules can be read end to end instead of in the
 * middle of transaction bookkeeping.
 *
 * The order is deliberate and is the whole content of this module:
 *
 *   1. **Aqua**, when a maker's book can serve the size. The maker self-custodies through Aqua and
 *      we trade inside a cap the taker signed, so both sides keep their own money.
 *   2. **SwapVM**, when a maker has shipped a program. Same shape, different enforcement: the
 *      deadline, the floor and the fee are compiled into bytecode the router executes, rather than
 *      trusted to whoever submits the fill.
 *   3. **The aggregator**, which always has an answer.
 *
 * Neither book is tried on a close or a direct leg. An exit has to be certain, and a book deep
 * enough to buy into may not be deep enough to sell out of.
 */
import type { Address } from 'viem';
import { buildSwap, quote, slippageFor, SLIPPAGE, TOKENS as VENUE_TOKENS } from '../venues/oneinch.js';
import { buildAquaFill } from '../venues/aqua.js';
import { buildSwapVmFill } from '../venues/swapvm.js';
import type { TradeIntent } from './kinds/index.js';

/**
 * The venue that settled, as the activity log and `/metrics` name it.
 *
 * `aave` is a direct leg — idle cash supplied to the pool, no swap anywhere. It was labelled
 * `1inch`, because that was the fallthrough, so the first Earn deposit on the rebuilt fork was
 * written down as an aggregator fill and `/metrics` reported "1inch: 1 fill, 0 bps" for a trade the
 * aggregator never saw.
 */
export type SettlementVenue = 'aqua' | 'swapvm' | '1inch' | 'aave';

export type Settlement = {
  /** The token being spent, from the registry. */
  payToken: { address: Address; decimals: number };
  /** The call `spend()` (or `closePosition()`) forwards. */
  swap: { to: Address; data: `0x${string}` };
  venue: SettlementVenue;
};

/**
 * @param owner     The user whose capital is being spent — never ours.
 * @param preferred What the subgraph join recommended, when it had an opinion.
 */
export async function chooseSettlement(params: {
  intent: TradeIntent;
  owner: Address;
  preferred: string | undefined;
  isClose: boolean;
  delegationFrom: Address;
}): Promise<Settlement> {
  const { intent, owner, preferred, delegationFrom } = params;
  const isCloseIntent = () => params.isClose;

  const payToken = VENUE_TOKENS[intent.inSymbol];
  if (!payToken) throw new Error(`No token registry entry for ${intent.inSymbol}`);

  /*
   * Aqua first, when a book can actually serve the size.
   *
   * The taker side is the side an operator can legitimately act on: the MAKER self-custodies
   * through Aqua (they signed their own ship), and WE trade inside a cap the taker signed and can
   * revoke. `delegatedFillArgs` returns exactly what `spend()` takes, so the fill goes through
   * the same permission as every other trade — cap, expiry and venue allowlist all enforced by
   * the contract rather than by us.
   *
   * `undefined` when no book can fill it, and that is not a failure: a maker quotes what they
   * hold. The aggregator takes it from there, which is the whole point of having both.
   *
   * Tried when the index recommended it AND, on a deployment with no index, whenever a book
   * exists — the chain is the authority here as everywhere else. Never on a close: an exit has
   * to be certain, and a book deep enough to buy into may not be deep enough to sell out of.
   */
  const aqua =
    intent.direct || isCloseIntent() || preferred === '1inch'
      ? undefined
      : await buildAquaFill({
          owner,
          tokenIn: payToken.address,
          tokenOut: (VENUE_TOKENS[intent.outSymbol]?.address ?? payToken.address) as Address,
          amountIn:
            intent.amountInRaw ??
            BigInt(Math.round(intent.amountIn * 10 ** payToken.decimals)),
          slippage: SLIPPAGE.scheduled / 100,
        }).catch(() => undefined);

  /*
   * Ask what this trade costs the pool before deciding what tolerance it needs.
   *
   * One extra quote on the settlement path, and it buys the only number that can tell a thin
   * pair from a deep one. Failure is not fatal: with no quote the slippage falls back to the
   * urgency constant, which is exactly the behaviour that existed before.
   */
  const quoted = aqua
    ? null
    : await quote({
        inSymbol: intent.inSymbol,
        outSymbol: intent.outSymbol,
        amount: intent.amountIn,
      }).catch(() => null);

  /*
   * A maker's SwapVM program, when one is shipped and Aqua could not serve the size.
   *
   * `XorrSwapVMBook` was deployed and tested and never called, which made it an artefact rather
   * than a venue. The difference from Aqua is what enforces the terms: an Aqua book quotes from a
   * curve the book contract evaluates, while a SwapVM maker ships compiled bytecode that the
   * router executes — the deadline, the floor and the fee live inside the VM instead of being
   * trusted to whoever submits the fill.
   *
   * Needs the quote first, because `delegatedFillArgs` takes a minimum-out and the only honest
   * source for that is what something else said this trade is worth. Same exclusions as Aqua: not
   * on a direct leg, and never on a close, where an exit has to be certain.
   */
  const swapVm =
    aqua || intent.direct || isCloseIntent() || preferred === '1inch' || !quoted
      ? undefined
      : await buildSwapVmFill({
          owner,
          tokenIn: payToken.address,
          tokenOut: (VENUE_TOKENS[intent.outSymbol]?.address ?? payToken.address) as Address,
          amountIn:
            intent.amountInRaw ?? BigInt(Math.round(intent.amountIn * 10 ** payToken.decimals)),
          slippage: SLIPPAGE.scheduled / 100,
          quotedOut: BigInt(
            Math.round(
              quoted.outAmount * 10 ** (VENUE_TOKENS[intent.outSymbol]?.decimals ?? 18),
            ),
          ),
        }).catch(() => undefined);

  const swap = aqua
    ? { to: aqua.venue, data: aqua.data }
    : swapVm
    ? { to: swapVm.venue, data: swapVm.data }
    : intent.direct
    ? { to: intent.direct.venue, data: intent.direct.data }
    : await buildSwap({
        inSymbol: intent.inSymbol,
        outSymbol: intent.outSymbol,
        // In the INPUT token's units. Passing dollars here scaled a position into wei and the
        // router refused a trade orders of magnitude too large.
        amount: intent.amountIn,
        // On a whole-position close the planner has the chain's own figure; the delegation and
        // the router have to be handed the same one or the router reverts for the difference.
        amountRaw: intent.amountInRaw,
        from: delegationFrom,
        receiver: owner,
        /*
         * Urgency sets the floor; the pool sets the rest.
         *
         * A risk-reducing close gets more room than a scheduled buy — see `SLIPPAGE` — but those
         * constants know nothing about the pair being traded. On a thin pool a $60 order can move
         * the price further than the ceiling allows, and the router then refuses at a price its
         * own quote had already predicted. `slippageFor` widens the ceiling by the impact the
         * quote reports, with a cap: a quote predicting several percent is saying the size is
         * wrong for the pool, and accepting that is paying for your own market impact.
         */
        slippagePct: slippageFor(
          isCloseIntent() ? SLIPPAGE.stop : SLIPPAGE.scheduled,
          quoted?.priceImpactPct ?? null,
        ),
      });
  return {
    payToken,
    swap,
    venue: aqua ? 'aqua' : swapVm ? 'swapvm' : intent.direct ? 'aave' : '1inch',
  };
}
