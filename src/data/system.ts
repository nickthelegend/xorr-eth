/**
 * The reads behind the screens that show how this thing actually works.
 *
 * Everything here already existed on the executor and had nowhere to be looked at. That is not an
 * accident of scheduling — the app grew screens for what a user *does* (buy, hold, watch) and left
 * the surfaces that let them *check* it in the API. The approvals a delegation holds, the hash
 * chain over the audit trail, the policy engine, the subgraph's lag, the price a second source
 * disagrees with: all of it real, none of it visible from the phone.
 *
 * These types mirror the executor's responses exactly, field for field. Where the server sends a
 * `uint256` as a string it stays a string — parsing it to a number here would round MAX_UINT256 to
 * 1.15e77 and every screen comparing it would be comparing a lie.
 */
import { api } from './api';

/* ─────────────────────────────────────────────────────────── trust and proof */

/**
 * One claim the product makes, checked against the running system.
 *
 * `skip` is a third status and carries real meaning: most of these need a wallet on the request, so
 * an anonymous report skips them rather than failing them. Rendering a skip as a failure would put
 * a wall of red in front of a reader for something that is not wrong.
 */
export type VerifyCheck = {
  id: string;
  claim: string;
  /** The exact call the check made — an RPC method, a query, a contract read. */
  how: string;
  status: 'pass' | 'fail' | 'skip';
  /** What came back. This is the evidence, and it is why the screen is worth having. */
  observed: string;
  ms: number;
};

export type VerifyReport = {
  checks: VerifyCheck[];
  passed: number;
  failed: number;
  skipped: number;
  chain: string;
  at: string;
};

/**
 * Whether the hash chain over the audit trail still holds.
 *
 * `kind` is the field that matters and the reason this is not one boolean. The server draws a line
 * the UI must not erase:
 *
 *   `content` — a row's stored hash does not match its own fields. Something EDITED the trail. That
 *               is tampering, and it is the alarm the whole structure exists to raise.
 *   `link`    — a row does not point at its predecessor, so rows fork instead of forming a line.
 *               That is damage from a concurrent write. It is permanent, because the trail is
 *               append-only, and it is not evidence that anyone altered a record.
 *
 * Reporting both as "broken" makes "two writers raced" read as "someone edited your audit log".
 */
export type ChainVerification = {
  ok: boolean;
  /** Rows examined. */
  checked: number;
  /** Rows whose own contents still hash to their stored hash, break or no break. */
  intact: number;
  brokenAtSeq?: string;
  kind?: 'link' | 'content';
};

export type TokenApproval = {
  symbol: string;
  address: string;
  /** Raw uint256, as a string. See the module note. */
  allowance: string;
  /** The same value in the token's own units. */
  display: string;
  decimals: number;
  unlimited: boolean;
  none: boolean;
};

export type Approvals = { spender: string; tokens: TokenApproval[] };

export type Limits = {
  dailyCapUsd: number;
  spentTodayUsd: number;
  remainingUsd: number;
  revoked: boolean;
};

export type DelegationParams = {
  contract: string;
  delegate: string;
  venues: string[];
  token: string;
  tokens?: { symbol: string; address: string }[];
};

/* ──────────────────────────────────────────────────────────────── the graph */

/** `_meta` from the subgraph: the block it has indexed to, and whether it errored doing it. */
export type GraphHealth = { block: number; healthy: boolean };

/** One `Spend` event as the subgraph indexed it. Amounts are raw units, as strings. */
export type GraphSpend = {
  id: string;
  amount: string;
  spentToday: string;
  venue: string;
  token: string;
  txHash: string;
  /** Unix seconds, as a string — it is a GraphQL BigInt. */
  timestamp: string;
};

export type GraphDailySpend = { day: string; total: string; tradeCount: string };

export type GraphActivity = { spends: GraphSpend[]; daily: GraphDailySpend[] };

/** Which venue the router would pick for a size, and what it compared. */
export type GraphDecision = Record<string, unknown>;

/* ─────────────────────────────────────────────────────────────── the system */

export type HealthDependency = {
  name: string;
  status: string;
  ms?: number;
  detail?: string;
  critical?: boolean;
};

export type Health = {
  ok: boolean;
  status: string;
  chain: string;
  delegation: string;
  uptimeSec: number;
  dependencies: HealthDependency[];
  db?: string;
  publicSurface?: { paths: string[] };
};

export type CatchupEntry = {
  action: string;
  detail: string;
  kind?: string;
  at: string;
  signature?: string | null;
};

export type Catchup = {
  since: string | null;
  entries: CatchupEntry[];
  counts: Record<string, number>;
  isFirstVisit?: boolean;
};

/* ─────────────────────────────────────────────────────────────────── market */

/**
 * The same asset priced two ways. Field names are the server's, checked against a live response.
 *
 * `compared: false` means only one source answered, which is NOT a disagreement — an outage tells
 * you nothing about the other source's number, and rendering it as a discrepancy sends someone
 * looking for a problem in the wrong place.
 */
export type CrossCheck = {
  symbol: string;
  /** Null when that source could not be reached. Never zero — zero is a price. */
  oneinch: number | null;
  coingecko: number | null;
  agree: boolean;
  compared: boolean;
  /** How far apart, as a percentage. Absent when only one side answered. */
  spreadPct?: number | null;
  note: string;
};

export type TradableToken = { symbol: string; address: string; decimals: number };

/* ──────────────────────────────────────────────────────────── strategy runs */

/**
 * One run of one strategy, including the ones that did nothing.
 *
 * `blocked` and `skipped` are the interesting statuses. A list of fills is a highlight reel; a run
 * that refused, with the reason it refused, is what shows the limits working.
 *
 * Every numeric is nullable because a run that never reached a fill has no price and no size, and
 * zero would be a different claim.
 */
export type StrategyRunRow = {
  id: string;
  strategyId: string;
  kind: string;
  label: string;
  symbol: string;
  status: 'pending' | 'filled' | 'failed' | 'blocked' | 'skipped';
  usd: number | null;
  units: number | null;
  price: number | null;
  signature: string | null;
  error: string | null;
  at: string;
  finishedAt: string | null;
};

/** One push kind, its explanation, and whether it is on. Labels come from the server. */
/** One sale, with its cost basis. `basisKnown: false` means the gain is understated. */
export type Disposal = {
  id: string;
  symbol: string;
  at: string;
  units: number;
  proceeds: number;
  cost: number;
  realised: number;
  basisKnown: boolean;
};

/**
 * A proposal as it was shown, plus what became of it.
 *
 * `payload` is stored at the time and rendered as stored. Re-pricing it against today's market
 * would rewrite what was actually put in front of someone, which is the one thing a record of
 * decisions must not do.
 */
export type ProposalRow = {
  id: string;
  agent: string;
  payload: Record<string, unknown>;
  /** Null only while it is still open and unexpired. */
  decision: 'approve' | 'skip' | 'expired' | null;
  decidedAt: string | null;
  expiresAt: string;
  at: string;
};

/**
 * What a strategy would have done over a past window.
 *
 * `feed`, `source` and `disclaimer` come from the server and are rendered, not dropped. A backtest
 * without the window it ran over and where the prices came from is a sales pitch.
 */
export type StrategyBacktest = {
  lookback: string;
  ret: number;
  maxDd: number;
  sharpe: number;
  trades: number;
  equity: number[];
  feed: 'live';
  source: string;
  disclaimer: string;
};

/**
 * What the executor has done, counted. Public — it names no wallet.
 *
 * `failuresByCause` and `fillsByVenue` are the two worth rendering and the two easiest to miss. A
 * failure rate says something is wrong and nothing about what; the causes are bucketed server-side
 * from the stored error text into the things an operator would act on differently — a price that
 * moved is the market, a revoked permission is the user, a venue that could not fill is us.
 *
 * `fillsByVenue` counts where trades actually settled, read from the audit trail's own wording. It
 * is the claim the 1inch integration rests on, as a number.
 */
export type Metrics = {
  runs: Record<string, number>;
  /** Fills that did not happen because something broke, as a fraction of attempts. */
  runFailureRate: number;
  /** Last seven days, bucketed by cause. */
  failuresByCause: Record<string, number>;
  fillsByVenue: Record<string, number>;
  strategies: Record<string, number>;
  alertsEnabled: number;
  alertsFiredTotal: number;
  spentTodayUsd: number;
  uptimeSec: number;
};

/**
 * When a company last reported and when it is projected to next.
 *
 * `nextAt` is a PROJECTION and `errorDays` is how wrong it could reasonably be — both derived from
 * the company's own filing cadence. Rendering the projection beside the observed dates without that
 * distinction would be handing someone a date to trade on.
 */
export type EarningsCalendar = {
  symbol: string;
  cik: number;
  /** Observed report dates, newest first, UTC ms. */
  reported: number[];
  nextAt: number | null;
  gapDays: number[];
  medianGapDays: number | null;
  errorDays: number;
};

/** A price this deployment actually recorded, as opposed to one a feed would give now. */
export type ObservedHistory = {
  symbol: string;
  points: { at: number; usd: number }[];
  observedSince: number | null;
  note: string;
};

/** What flattening would sell, before it sells it. */
export type FlattenPreview = {
  legs: { symbol: string; units: number; usd: number }[];
  totalUsd: number;
  dustBelowUsd: number;
};

/** One tokenized equity, priced by a live 1inch probe rather than a feed. */
export type StockRow = {
  symbol: string;
  name: string;
  address: string;
  price: number | null;
  venues: string[];
  feed: 'live' | 'unavailable';
};

export type NotificationPref = {
  kind: string;
  label: string;
  detail: string;
  enabled: boolean;
};

/**
 * One repository, because these are all the same kind of read: state the executor already holds,
 * fetched to be looked at rather than acted on. Splitting them per-domain would give ten interfaces
 * with one method each.
 */
export const system = {
  /* trust */
  verifyReport: (owner?: string) =>
    api.get<VerifyReport>(`/verify${owner ? `?owner=${encodeURIComponent(owner)}` : ''}`),
  auditChain: () => api.get<ChainVerification>('/activity/verify'),
  approvals: () => api.get<Approvals>('/approvals'),
  /*
   * There is deliberately no `agentKeys()` here.
   *
   * `/agent/*` is the operator surface and authenticates with an agent key, not a user's Privy
   * token — "Operator only, and the operator cannot trade". A screen was built against it and 401'd
   * for every session, which is what a client method for a route this app cannot authenticate to
   * will always produce.
   */
  limits: () => api.get<Limits>('/limits'),
  delegationParams: () => api.get<DelegationParams>('/delegation/params'),

  /* the graph */
  graphHealth: () => api.get<GraphHealth>('/graph/health'),
  graphActivity: () => api.get<GraphActivity>('/graph/activity'),
  graphDecision: (usd: number) => api.get<GraphDecision>(`/graph/decision?usd=${usd}`),

  /* the system */
  health: () => api.get<Health>('/health'),
  catchup: () => api.get<Catchup>('/catchup'),
  markCaughtUp: () => api.post<{ ok: boolean }>('/catchup/seen', {}),

  /* market */
  crosscheck: (symbol: string) =>
    api.get<CrossCheck>(`/market/crosscheck?symbol=${encodeURIComponent(symbol)}`),
  tradable: () => api.get<TradableToken[]>('/market/tradable'),

  /* identity */
  basenameOf: (address: string) =>
    api.get<{ address: string; name: string | null }>(
      `/basename?address=${encodeURIComponent(address)}`,
    ),
  addressOf: (name: string) =>
    api.get<{ name: string; address: string | null }>(
      `/basename?name=${encodeURIComponent(name)}`,
    ),

  /* strategies */
  runs: (limit = 100) => api.get<StrategyRunRow[]>(`/runs?limit=${limit}`),
  disposals: () => api.get<Disposal[]>('/disposals'),
  metrics: () => api.get<Metrics>('/metrics'),
  earnings: (symbol: string) =>
    api.get<EarningsCalendar>(`/market/earnings?symbol=${encodeURIComponent(symbol)}`),
  observed: (symbol: string, hours = 720) =>
    api.get<ObservedHistory>(
      `/market/stocks/history?symbol=${encodeURIComponent(symbol)}&hours=${hours}`,
    ),
  flattenPreview: () => api.get<FlattenPreview>('/panic/preview'),
  stocks: () => api.get<StockRow[]>('/market/stocks'),
  symbols: () => api.get<string[]>('/market/symbols'),
  backtestStrategy: (body: {
    kind: 'dca' | 'grid';
    symbol: string;
    lookback: '30d' | '90d' | '6m' | '1y';
    params: Record<string, number>;
  }) => api.post<StrategyBacktest>('/strategies/backtest', body),
  proposals: () => api.get<ProposalRow[]>('/proposals'),
  notificationPrefs: () => api.get<NotificationPref[]>('/notifications/prefs'),
  setNotificationPref: (kind: string, enabled: boolean) =>
    api.patch<{ ok: boolean }>('/notifications/prefs', { kind, enabled }),
} as const;
