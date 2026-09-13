/**
 * Which venue settles this leg, and the exact call that does it.
 *
 * Split out of `run.ts`, which had grown back to 1,058 lines as venues were added — and venue
 * selection is the part that kept growing. `run.ts` is about a run: claim the period, check the
 * gates, send, measure, write the book. WHERE a trade fills is a separate question with its own
 * rules, and it now has a file where those rules can be read end to end instead of in the middle
 * of transaction bookkeeping.
 *
 * The rule is best execution, and it is the whole content of this module (PLAN.md 3.20):
 *
 *   1. **Every venue that can serve the leg says what it would deliver.** An **Aqua** book quotes
 *      the size from its own curve; a maker's **SwapVM** program is dry-run through `spend()`, which
 *      returns the router's answer; **the aggregator** quotes the route.
 *   2. **The leg settles where the owner receives the most.** A book wins when it delivers at least
 *      what the aggregator quotes, and Aqua wins a tie with SwapVM: the maker self-custodies through
 *      Aqua, a program's terms are enforced in bytecode, and between equal prices a book is the
 *      better counterparty.
 *
 * It had been a fixed order — Aqua whenever a book could serve, then SwapVM, then the aggregator —
 * and on the rebuilt fork that would have filled a $50 buy 1.1% under the aggregator's quote,
 * because a shallow book could serve it.
 *
 * Neither book is tried on a close or a direct leg. An exit has to be certain, and a book deep
 * enough to buy into may not be deep enough to sell out of.
 */
import type { Address } from 'viem';
import type { OutputFloor } from '../evm/delegation.js';
import { buildSwap, quote, slippageFor, SLIPPAGE, TOKENS as VENUE_TOKENS } from '../venues/oneinch.js';
import { buildAquaFill } from '../venues/aqua.js';
import type { AquaFill } from '../venues/aqua.js';
import { buildSwapVmFill } from '../venues/swapvm.js';
import type { SwapVmFill } from '../venues/swapvm.js';
import { aquaIndexConfigured } from '../graph/aqua.js';
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
  /**
   * What the owner must receive for the trade to stand. Enforced by the contract against the owner's
   * own balance (PLAN.md 1.4) — each venue supplies its own honest floor: the book's quote less
   * slippage, the program's compiled minimum, the router's `dstAmount` less slippage, or the pool's
   * receipt token.
   */
  floor: OutputFloor;
};

/** A book that can serve the leg, and what it would deliver the owner, in the output token's base units. */
type BookOffer = { venue: 'aqua'; fill: AquaFill; out: bigint } | { venue: 'swapvm'; fill: SwapVmFill; out: bigint };

/**
 * The better of the two books for this leg, Aqua keeping a tie.
 *
 * A program is compared on what its dry run delivered or, when that came back with nothing to read, on
 * the floor its bytecode enforces — the least it can deliver, never more than it promised.
 */
function bestBook(aqua: AquaFill | undefined, swapVm: SwapVmFill | undefined): BookOffer | undefined {
  const offers: BookOffer[] = [];
  if (aqua) offers.push({ venue: 'aqua', fill: aqua, out: aqua.quotedOut });
  if (swapVm) offers.push({ venue: 'swapvm', fill: swapVm, out: swapVm.expectedOut ?? swapVm.minOut });
  // Strictly more to displace, so the one listed first — Aqua — keeps a tie.
  return offers.reduce<BookOffer | undefined>((best, o) => (best === undefined || o.out > best.out ? o : best), undefined);
}

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
  /*
   * "Route to 1inch" is only an answer about the books when an Aqua index gave it (PLAN.md 3.4).
   *
   * `decide()` also says 1inch when no Aqua index is configured at all, or when it could not read one — and
   * this treated every one of those as "no book is deep enough" and skipped both books without looking. A
   * delegation index alone could silently route every fill past a book that was sitting there on chain.
   * Without an Aqua index, the books are discovered from Aqua's own logs below, as they would be with no
   * index at all.
   */
  const skipBooks = preferred === '1inch' && aquaIndexConfigured();

  const payToken = VENUE_TOKENS[intent.inSymbol];
  if (!payToken) throw new Error(`No token registry entry for ${intent.inSymbol}`);
  const outToken = VENUE_TOKENS[intent.outSymbol];
  const tokenOut = (outToken?.address ?? payToken.address) as Address;
  const amountIn = intent.amountInRaw ?? BigInt(Math.round(intent.amountIn * 10 ** payToken.decimals));
  const booksInPlay = !intent.direct && !isCloseIntent() && !skipBooks;
  // A tolerance the person chose is the tolerance every venue gets (PLAN.md 3.9); otherwise the scheduled one.
  const bookSlippage = (intent.slippagePct ?? SLIPPAGE.scheduled) / 100;

  /*
   * The aggregator's quote first.
   *
   * It is the price a book has to beat, SwapVM's floor is taken from it, and it is the only number that
   * can tell a thin pair from a deep one before deciding what tolerance the route needs. A direct leg has
   * no route to quote. Failure is not fatal: an Aqua book quotes itself, and the aggregator's tolerance
   * falls back to the urgency constant.
   */
  const quoted = intent.direct
    ? null
    : await quote({
        inSymbol: intent.inSymbol,
        outSymbol: intent.outSymbol,
        amount: intent.amountIn,
      }).catch(() => null);
  const quotedOut = quoted ? BigInt(Math.round(quoted.outAmount * 10 ** (outToken?.decimals ?? 18))) : undefined;

  /*
   * The books, asked together.
   *
   * Aqua: the taker side is the side an operator can legitimately act on — the MAKER self-custodies
   * through Aqua (they signed their own ship), and WE trade inside a cap the taker signed and can revoke.
   * `delegatedFillArgs` returns exactly what `spend()` takes, so the fill goes through the same permission
   * as every other trade: cap, expiry and venue allowlist, all enforced by the contract rather than by us.
   *
   * SwapVM: the same shape with different enforcement — the deadline, the floor and the fee are compiled
   * into bytecode the router executes, rather than trusted to whoever submits the fill. It needs the quote,
   * because `delegatedFillArgs` takes a minimum out and the only honest source for that is what something
   * else said this trade is worth.
   *
   * `undefined` from either is not a failure: a maker quotes what they hold, and the aggregator is there
   * for the rest. Tried whenever a book exists and nothing rules the books out — the chain is the authority
   * here as everywhere else.
   */
  const [aqua, swapVm] = booksInPlay
    ? await Promise.all([
        buildAquaFill({
          owner,
          tokenIn: payToken.address,
          tokenOut,
          amountIn,
          slippage: bookSlippage,
        }).catch(() => undefined),
        quotedOut === undefined
          ? Promise.resolve(undefined)
          : buildSwapVmFill({
              owner,
              tokenIn: payToken.address,
              tokenOut,
              amountIn,
              slippage: bookSlippage,
              quotedOut,
            }).catch(() => undefined),
      ])
    : [undefined, undefined];

  /*
   * Best execution. A book settles the leg when it delivers at least what the aggregator quotes. With no
   * quote there is nothing to hold a book against, and a book that serves is taken — its own quote is real.
   */
  const book = bestBook(aqua, swapVm);
  if (book && (quotedOut === undefined || book.out >= quotedOut)) {
    if (book.venue === 'aqua') {
      return {
        payToken,
        swap: { to: book.fill.venue, data: book.fill.data },
        venue: 'aqua',
        floor: { tokenOut: book.fill.tokenOut, minOut: book.fill.minOut },
      };
    }
    return {
      payToken,
      swap: { to: book.fill.venue, data: book.fill.data },
      venue: 'swapvm',
      floor: { tokenOut: book.fill.tokenOut, minOut: book.fill.minOut },
    };
  }

  if (intent.direct) {
    return {
      payToken,
      swap: { to: intent.direct.venue, data: intent.direct.data },
      venue: 'aave',
      floor: { tokenOut: intent.direct.tokenOut, minOut: intent.direct.minOut },
    };
  }

  const aggregator = await buildSwap({
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
    slippagePct:
      /*
       * Except where the person named a tolerance of their own (PLAN.md 3.9): the urgency constants and the
       * impact widening are defaults for trades nobody is watching, not a ceiling to put on someone who chose.
       * A route that needs more than they allowed is refused by the router, and says so.
       */
      intent.slippagePct ??
      slippageFor(isCloseIntent() ? SLIPPAGE.stop : SLIPPAGE.scheduled, quoted?.priceImpactPct ?? null),
  });
  if (!outToken) throw new Error(`No token registry entry for ${intent.outSymbol}`);
  return {
    payToken,
    swap: { to: aggregator.to, data: aggregator.data },
    venue: '1inch',
    floor: { tokenOut: outToken.address, minOut: aggregator.minOut },
  };
}
