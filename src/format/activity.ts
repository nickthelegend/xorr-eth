/**
 * An activity line as the main screens say it: what happened, without where it settled.
 *
 * The executor writes the venue into the trail's action line — "Bought 0.0020 WETH against a maker's SwapVM program" — so
 * the trail can be checked against where the money went, and the Proof screens show every entry as written. Home, Activity,
 * Inbox, Catch-up and Business say what the bot did in the words a person uses; the venue stays in the trail, one tap away.
 */
const VENUE_CLAUSES: readonly (readonly [RegExp, string])[] = [
  [/ against a maker['’]s SwapVM program\b/g, ''],
  [/ on an Aqua book\b/g, ''],
  [/ against (?:our own|a maker['’]s) Aqua book\b/g, ''],
  [/ through (?:1inch(?: Fusion| Aqua)?|Aqua|SwapVM)\b/g, ''],
  [/ via 1inch\b/g, ''],
  [/ to Aave\b/g, ' to savings'],
];

export function plainAction(action: string): string {
  return VENUE_CLAUSES.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), action);
}
