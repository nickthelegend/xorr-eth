/**
 * The agent's pre-flight check, decided from indexed chain data.
 *
 * Every branch here changes what the bot DOES, which is the difference between using The Graph and
 * merely displaying it. Called by the executor before any spend.
 */
import { dailySpendFor, policyFor, spendsFor, unitsToUsd, type Spend } from './client.js';

export type Decision =
  | { act: true; sizeUsd: number; rationale: string; observedRemainingUsd: number }
  | { act: false; reason: string; rationale: string };

/** How much of the cap the bot is willing to commit in one trade. */
const MAX_FRACTION_OF_REMAINING = 0.25;
/** Below this, a trade costs more in gas than it is worth. */
const MIN_TRADE_USD = 5;
/**
 * If nearly all recent flow ran one way, the book is being picked off rather than traded around.
 * Stand down rather than keep quoting into it.
 */
const ONE_SIDED_THRESHOLD = 0.9;
const ONE_SIDED_MIN_SAMPLES = 4;

export function flowImbalance(spends: Spend[], token: string): number {
  if (spends.length === 0) return 0;
  const sameToken = spends.filter((s) => s.token.toLowerCase() === token.toLowerCase()).length;
  return sameToken / spends.length;
}

export async function decide(params: {
  owner: string;
  wantUsd: number;
  token: string;
}): Promise<Decision> {
  // 1. The permission, as the CHAIN records it. Our database is not consulted.
  const policy = await policyFor(params.owner);
  if (!policy) {
    return { act: false, reason: 'no_policy_onchain', rationale: 'No permission exists on-chain.' };
  }
  if (policy.revoked) {
    return { act: false, reason: 'revoked', rationale: 'The permission was revoked on-chain.' };
  }
  if (Number(policy.expiresAt) * 1000 <= Date.now()) {
    return { act: false, reason: 'expired', rationale: 'The permission has expired.' };
  }

  // 2. Today's spend, from indexed events rather than from our own bookkeeping.
  const days = await dailySpendFor(params.owner, 1);
  const today = Math.floor(Date.now() / 86_400_000).toString();
  const spentToday = days.find((d) => d.day === today);
  const capUsd = unitsToUsd(policy.dailyCap);
  const usedUsd = spentToday ? unitsToUsd(spentToday.total) : 0;
  const remaining = Math.max(0, capUsd - usedUsd);

  if (remaining < MIN_TRADE_USD) {
    return {
      act: false,
      reason: 'cap_exhausted',
      rationale: `The chain shows today's cap is used up.`,
    };
  }

  // 3. Realised flow. One-sided flow is what being picked off looks like from the outside.
  const recent = await spendsFor(params.owner, 20);
  const imbalance = flowImbalance(recent, params.token);
  if (recent.length >= ONE_SIDED_MIN_SAMPLES && imbalance >= ONE_SIDED_THRESHOLD) {
    return {
      act: false,
      reason: 'one_sided_flow',
      rationale: 'Recent settled flow ran almost entirely one way, so I am standing down.',
    };
  }

  const sizeUsd = Math.min(params.wantUsd, remaining * MAX_FRACTION_OF_REMAINING, remaining);
  if (sizeUsd < MIN_TRADE_USD) {
    return {
      act: false,
      reason: 'size_too_small',
      rationale: 'What is left today is too small to be worth the gas.',
    };
  }

  return {
    act: true,
    sizeUsd,
    observedRemainingUsd: remaining,
    rationale: 'Permission is live on-chain and today has room.',
  };
}
