/**
 * Agent & asset identity gradients — design.md §1 "Agent identity gradients".
 *
 * Every mark is `radial-gradient(circle at 32% 26%, c1, c2 74%)`. The off-center origin IS the
 * specular highlight and MUST NOT MOVE — design.md states this explicitly.
 *
 * React Native has no CSS radial gradient, so `AgentOrb` renders this with react-native-svg's
 * <RadialGradient> using exactly these numbers: fx/fy = 32%/26%, the c2 stop at 74%.
 */

export type GradientPair = { c1: string; c2: string };

/** The five agent gradients. design.md §1. */
export const agentGradients = {
  'Momentum Scout': { c1: '#5B93FF', c2: '#1B44CE' },
  Signals: { c1: '#5B93FF', c2: '#1B44CE' },
  'Earnings Desk': { c1: '#F0BE55', c2: '#C98518' },
  Stocks: { c1: '#F0BE55', c2: '#C98518' },
  'Yield Keeper': { c1: '#49E39B', c2: '#12A45F' },
  Crypto: { c1: '#49E39B', c2: '#12A45F' },
  'Drawdown Guard': { c1: '#B58CFF', c2: '#7A45E0' },
  Strategist: { c1: '#C79BFF', c2: '#7B3FE4' },
} as const satisfies Record<string, GradientPair>;

export type AgentGradientName = keyof typeof agentGradients;

/** The exact geometry of the recipe. Consumed by AgentOrb / AssetMark; never hand-tune per call. */
export const RADIAL = {
  /** `circle at 32% 26%` — the specular origin. */
  fx: '32%',
  fy: '26%',
  /** `c2 74%` — where the second stop lands. */
  c2Stop: '74%',
  /** The gradient circle covers the whole square mark. */
  r: '74%',
} as const;

export function agentGradient(name: string): GradientPair {
  return (
    (agentGradients as Record<string, GradientPair | undefined>)[name] ??
    agentGradients['Momentum Scout']
  );
}
