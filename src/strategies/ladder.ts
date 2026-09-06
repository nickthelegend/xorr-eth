/**
 * The strategy ladder — PLAN.md §1.2.
 *
 * Ordered by how much the bot has to be RIGHT ABOUT THE FUTURE, not by how impressive it sounds.
 * "A user who has watched tier 1 work for three weeks will let the bot run tier 6. A user shown
 * tier 6 on day one will not fund the account. Do not reorder this."
 */
import type { StrategyKind } from '../data/types';

export type LadderEntry = {
  tier: number;
  kind: StrategyKind;
  label: string;
  what: string;
  /** Why it sits at this rung — the judgement the bot has to exercise. */
  judgement: string;
  available: boolean;
  cta: string;
  route: string;
};

export const STRATEGY_LADDER: LadderEntry[] = [
  {
    tier: 1,
    kind: 'dca',
    label: 'Recurring buy',
    what: 'A fixed amount into one asset on a schedule you set. The bot picks nothing.',
    judgement: 'No forecast. You can check every run against the calendar.',
    available: true,
    cta: 'Set up a recurring buy',
    route: '/strategy/dca',
  },
  {
    tier: 2,
    kind: 'rebalance',
    label: 'Rebalance to targets',
    what: 'Holds your sleeves at the weights you approved, trading only the drift.',
    judgement: 'Deterministic. The only input is your own target.',
    available: true,
    cta: 'Set target weights',
    route: '/(onboarding)/proposal',
  },
  {
    tier: 3,
    kind: 'exit-rules',
    label: 'Take profit and stop loss',
    what: 'Closes a position at levels you set. It never opens one.',
    judgement: 'Risk-reducing only. Easy to trust because it can only close.',
    available: true,
    cta: 'Set exit rules',
    // Exit rules attach to a position, so the route is the position list. `/auto-close/current`
    // was never a real id — it rendered the not-found state for anyone who tapped it.
    route: '/holdings',
  },
  {
    tier: 4,
    kind: 'yield-rotation',
    label: 'Move idle cash to yield',
    what: 'Supplies idle USDC to Aave v3 on Base, at the rate the pool publishes.',
    judgement: 'Low judgement, and every move is a published rate you can check.',
    available: true,
    cta: 'Move idle cash to yield',
    route: '/strategy/yield',
  },
  {
    tier: 5,
    kind: 'grid',
    label: 'Range accumulation',
    what: 'Buys a rung lower and sells a rung higher, inside a band you draw.',
    judgement: 'Mechanical. No forecast, but it assumes the range holds.',
    available: true,
    cta: 'Draw a range',
    route: '/strategy/grid',
  },
  {
    tier: 6,
    kind: 'momentum',
    label: 'Momentum and breakouts',
    what: 'Buys strength on liquid majors, with a stop attached to every entry.',
    judgement:
      'The first strategy that needs the bot to be right about the future. Ships asking first.',
    available: false,
    cta: 'Later',
    route: '/strategies',
  },
  {
    tier: 7,
    kind: 'event-driven',
    label: 'Events and earnings',
    what: 'Positions around scheduled events, and flattens before the print.',
    judgement: 'Most judgement, most ways to be wrong. Last.',
    available: false,
    cta: 'Later',
    route: '/strategies',
  },
];

/** Approve-before-execute is ON by default from tier 6 up. PLAN.md 9.10. */
export function requiresApprovalByDefault(kind: StrategyKind): boolean {
  const entry = STRATEGY_LADDER.find((e) => e.kind === kind);
  return (entry?.tier ?? 99) >= 6;
}
