/**
 * A chain read that failed, kept distinct from a chain that answered "nothing" (PLAN.md 1.7).
 *
 * Routes caught their chain reads and substituted a value — `usd: 0`, `null`, `revoked: true`, `[]` —
 * so a timeout reached the screen as a confident statement about the user's money: "$0.00", "no
 * permission", "permission is off", "no venues allowed". Every one of those is a real state a user
 * can be in, which is exactly why a failed read must never look like one.
 */
export class ChainReadFailed extends Error {
  readonly status = 502;
  constructor(
    /** What was being read, in the words the message uses: "your permission", "your balance". */
    readonly what: string,
    /** The error the read threw, kept for the log. */
    readonly underlying: unknown,
  ) {
    super(`Could not read ${what} from the chain just now.`);
    this.name = 'ChainReadFailed';
  }
}

/** Run a chain read. A throw becomes `ChainReadFailed`; an answer — including an answer of null — passes through. */
export async function readChain<T>(what: string, read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (e) {
    throw new ChainReadFailed(what, e);
  }
}
