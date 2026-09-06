/**
 * What the user is told when a trade does not go through.
 *
 * On-chain failures the handoff never designed for — PLAN.md 10.13 [G46]. Each one gets
 * plain language, because "custom program error: 0x1" is not something to show a person.
 *
 * ## Why this is its own module
 *
 * It is a pure string table with no dependencies, and it lived in `executor/run.ts` — which
 * imports the 1inch venue, the chain client and (until recently) an HTTP route module. So a
 * unit test for this function failed at import time with "ONEINCH_API_KEY is required",
 * which says nothing about the thing under test. A pure function should be testable without
 * standing up the world it happens to be used in.
 */
export function humanFailure(error: string): string {
  const e = error.toLowerCase();

  /**
   * XorrDelegation's custom errors, by 4-byte selector.
   *
   * Match the selector EXACTLY. Substring matching is a trap here — one selector is a prefix of
   * another often enough that a naive `includes` reports the wrong cause, which on a trading
   * surface is worse than saying nothing. (These replaced a table of Solana Anchor codes that
   * could never fire on an EVM chain, so every real revert fell through to the generic line.)
   */
  const BY_SELECTOR: Record<string, string> = {
    '0x1db3b859': 'That agent is not the one you gave permission to.', // NotDelegate()
    '0x430f7460': 'You revoked the trading permission, so nothing was placed.', // PolicyRevoked()
    '0x9c5bebca': 'The trading permission has expired. Renew it to let the bot trade again.', // PolicyExpired()
    '0x2114fba2': 'That venue is not on your allowlist, so the trade was refused.', // VenueNotAllowed
    '0x3e814127': "Today's cap is used up. Nothing was placed.", // DailyCapExceeded
    '0x1f2a2005': 'The order size came out as zero, so nothing was placed.', // ZeroAmount()
    '0xc2e441e5': 'The venue rejected the order, so nothing was placed.', // VenueCallFailed()
    /*
     * 1inch's own errors, now that the delegation bubbles them instead of masking them.
     *
     * `ReturnAmountIsNotEnough` is the common one and used to arrive as VenueCallFailed, so a
     * trade blocked by a price move looked identical to malformed calldata. It is the difference
     * between "try again" and "something is broken", and the user is the one who has to decide.
     */
    '0x9a446475': 'The price moved more than your slippage limit while this was in flight. Nothing was placed.', // ReturnAmountIsNotEnough(uint256)
    '0xf32bec2f': 'The price moved more than your slippage limit while this was in flight. Nothing was placed.', // ReturnAmountIsNotEnough()
    '0xf4059071': 'The venue could not collect the token — the approval was short or withdrawn.', // SafeTransferFromFailed()
    '0x28ebf247': 'The route came back with nothing, so there was no trade to make.', // ZeroReturnAmount()
  };
  const selector = /(?:custom error|reverted with|signature)[^0-9a-fx]*(0x[0-9a-f]{8})\b/.exec(e)?.[1];
  if (selector && BY_SELECTOR[selector]) return BY_SELECTOR[selector];

  // Named errors, when the RPC decodes them for us.
  if (e.includes('dailycapexceeded')) return BY_SELECTOR['0x3e814127']!;
  if (e.includes('policyrevoked')) return BY_SELECTOR['0x430f7460']!;
  if (e.includes('policyexpired')) return BY_SELECTOR['0x9c5bebca']!;
  if (e.includes('venuenotallowed')) return BY_SELECTOR['0x2114fba2']!;
  if (e.includes('notdelegate')) return BY_SELECTOR['0x1db3b859']!;
  if (e.includes('returnamountisnotenough')) return BY_SELECTOR['0x9a446475']!;

  if (e.includes('cannot fill on'))
    return 'This network cannot settle trades. Prices are real; filling needs Base or a Base fork.';
  if (e.includes('transfer amount exceeds allowance') || e.includes('pull failed'))
    return 'The spending approval is too small or was withdrawn, so nothing could be pulled.';
  // The bot paying for gas and the user paying for the trade are different pockets, and saying
  // "you are short" when the bot is short sends someone looking in the wrong place.
  if (e.includes('exceeds the balance of the account') || e.includes('gas required exceeds'))
    return 'The agent ran out of gas money on this network, so nothing was placed. Your funds are untouched.';
  if (e.includes('insufficient funds') || e.includes('exceeds balance'))
    return 'Not enough settled balance to cover this buy.';
  if (e.includes('slippage') || e.includes('returnamount') || e.includes('min return'))
    return 'The price moved more than your slippage limit while this was in flight.';
  if (e.includes('nonce') || e.includes('replacement transaction'))
    return 'The network moved on before this confirmed. Nothing was placed; I will retry.';
  if (e.includes('timed out') || e.includes('timeout'))
    return 'The network did not confirm in time. I will check and retry rather than send twice.';
  if (e.includes('gas') || e.includes('fee too low') || e.includes('underpriced'))
    return 'The network was congested and the fee was too low to land.';
  return 'The transaction did not go through, so nothing was placed.';
}
