/**
 * The routing half of notifications, split out so it is testable on Node without the native
 * expo-notifications module. PLAN.md 12.19 / 10.10.
 */
export type AlertKind =
  | 'price'
  | 'earnings'
  | 'daily-cap'
  | 'drawdown'
  | 'staking-unlock'
  | 'proposal-awaiting'
  | 'dca-executed'
  | 'strategy-blocked';

/**
 * Which alerts are INTERRUPTIONS the user may mute.
 *
 * All of them — because screens.md screen 18 draws the line elsewhere: "Circuit breakers stay on
 * even when notifications are muted. They stop trading, not just your phone." The breaker lives in
 * the server's rule engine and is deliberately not represented in this file.
 */
export const MUTABLE: Record<AlertKind, boolean> = {
  price: true,
  earnings: true,
  'daily-cap': true,
  drawdown: true,
  'staking-unlock': true,
  'proposal-awaiting': true,
  'dca-executed': true,
  'strategy-blocked': true,
};

export function routeFor(kind: AlertKind): string {
  switch (kind) {
    case 'proposal-awaiting':
      return '/bot';
    case 'dca-executed':
    case 'strategy-blocked':
      return '/activity';
    case 'daily-cap':
    case 'drawdown':
      return '/safety';
    case 'staking-unlock':
      return '/strategies';
    case 'price':
    case 'earnings':
      return '/alerts';
  }
}
