/**
 * Repository interfaces — PLAN.md 3.2 / §3.8.
 *
 * "The whole client builds against typed repository interfaces with a fixture implementation.
 * Phase 12 swaps implementations, not screens. Any screen calling `fetch` directly is a bug."
 *
 * Enforced by src/data/repositories.test.ts, which greps the screen layer for `fetch(`.
 */
import type {
  ActivityEvent,
  Agent,
  Alert,
  AssetClass,
  BacktestResult,
  Candles,
  Delegation,
  Instrument,
  NewsItem,
  Position,
  PrivyPolicyView,
  Proposal,
  Sleeve,
  Strategy,
  Timeframe,
  Wallet,
} from './types';

export interface MarketRepository {
  listClasses(): Promise<AssetClass[]>;
  getInstrument(symbol: string): Promise<Instrument | null>;
  /** Live quotes for the given symbols. Falls back to the fixture price with feed:'simulated'. */
  /**
   * Spot price per symbol. `change24h` is optional on purpose: the tokenized equities are priced
   * from a single swap quote, which has no 24h window behind it. Reporting 0 there would read as a
   * measured "unchanged today".
   */
  quotes(
    symbols: string[],
  ): Promise<
    Record<string, { price: number; change24h?: number; warming?: boolean } | undefined>
  >;
  candles(symbol: string, timeframe: Timeframe): Promise<Candles>;
  /** A day of closes per symbol, for the row glyphs. Symbols without history are omitted. */
  sparklines(symbols: string[]): Promise<Record<string, number[]>>;
}

export interface BotRepository {
  /** Hire a persona. Idempotent — hiring twice is the same agent. */
  hire(personaId: string): Promise<Agent>;
  /** Fire one. Its strategies are paused, never deleted. */
  fire(agentId: string): Promise<{ pausedStrategies: number }>;
  /** Tone and per-agent limits. */
  updateAgent(agentId: string, patch: { tone?: string; riskLimits?: Record<string, unknown> }): Promise<Agent>;
  listAgents(): Promise<Agent[]>;
  currentProposal(): Promise<Proposal | null>;
  /**
   * Ask the agent to consider a trade — PLAN.md 12.18.
   * Returns null when it declined, WITH the reason, because "what it chose not to do" is the
   * product. The thread renders that decline rather than sitting empty.
   */
  generateProposal(): Promise<{ proposal: Proposal | null; declined?: string }>;
  decideProposal(id: string, decision: 'approve' | 'skip'): Promise<{ message: string }>;
  backtest(agentId: string, lookback: BacktestResult['lookback']): Promise<BacktestResult>;
  leaderboard(): Promise<Agent[]>;
  /**
   * Ask the bot something — PLAN.md 11.7. Returns prose only: every figure on screen is rendered
   * by the client from its own records, so the model cannot put a number in front of the user.
   */
  ask(params: {
    agentId: string;
    question: string;
    tone: 'dry' | 'sharp' | 'flat';
  }): Promise<{ text: string; source: 'model' | 'fallback' }>;
}

export interface StrategyRepository {
  /** Pause or resume. A paused strategy stops running and frees its share of the daily cap. */
  setState(id: string, state: 'live' | 'paused' | 'ended'): Promise<Strategy>;
  /** Run one now, through the same period claim the scheduler uses. */
  runNow(id: string): Promise<{ status: string; reason?: string; units?: number; price?: number }>;
  list(): Promise<Strategy[]>;
  create(s: Omit<Strategy, 'id' | 'createdAt'>): Promise<Strategy>;
  pause(id: string): Promise<Strategy>;
  resume(id: string): Promise<Strategy>;
  end(id: string): Promise<Strategy>;
}

export interface OrderRepository {
  /**
   * Place a market order. Screen 14's CTA.
   *
   * The executor picks the route and the price and enforces every limit — it runs the same
   * `runStrategy` path the scheduler runs. A `blocked` outcome carries the policy engine's
   * own reason, which is the sentence the user should read.
   */
  place(input: { symbol: string; usd: number }): Promise<OrderOutcome>;
}

export type OrderOutcome = {
  status: 'filled' | 'watch' | 'blocked' | 'failed' | 'skipped';
  orderId?: string;
  txHash?: string;
  units?: number;
  price?: number;
  reason?: string;
  detail?: string;
  error?: string;
};

export interface PortfolioRepository {
  positions(): Promise<Position[]>;
  position(id: string): Promise<Position | null>;
  sleeves(): Promise<Sleeve[]>;
  /** `null` means the balance could not be read — never render that as zero. */
  balanceUsd(): Promise<number | null>;
  /**
   * The same total, broken into what it is made of.
   *
   * Cash and supplied are different money: one can be spent today, the other is earning and has to
   * be withdrawn first. A screen that sweeps idle cash has to know which is which, and a single
   * total cannot tell it. `null` for the same reason as above.
   */
  balance(): Promise<{ total: number; cash: number; supplied: number } | null>;
  /**
   * Profit actually taken, by symbol and in total.
   *
   * Separate from `positions()` because a closed position is not a holding — but the money made
   * on it is real, and filtering it out of the holdings list took it out of the app entirely.
   */
  realised(): Promise<{
    total: number;
    bySymbol: {
      symbol: string;
      realised: number;
      unitsSold: number;
      proceeds: number;
      /** Some of what was sold had no recorded cost, so the figure understates the outcome. */
      basisIncomplete: boolean;
    }[];
  }>;
  /**
   * Sell part or all of a holding at the live route — screen 22's "Close {n}%", and the
   * sell side of the order ticket.
   *
   * Goes through `closePosition`, never `spend`, so the daily cap cannot silence it. The
   * executor picks the route and the price; the app sends only how much.
   */
  close(input: { symbol: string; fraction: number }): Promise<PositionClose>;
}
/** What came back from a close. `txHash` is the on-chain proof. */
export type PositionClose = {
  status: 'closed' | 'blocked' | 'failed';
  symbol?: string;
  units?: number;
  usd?: number;
  txHash?: string;
  reason?: string;
  detail?: string;
  error?: string;
};


export interface ActivityRepository {
  list(): Promise<ActivityEvent[]>;
  /** PLAN.md 12.11: the audit trail is the compliance artifact, so export is a real feature. */
  exportTrail(format: 'csv' | 'json'): Promise<string>;
  /**
   * Every disposal with its cost basis — the document an accountant asks for.
   *
   * Distinct from the audit trail, which records what the bot did. Blocked runs belong in one and
   * cost basis belongs in the other, and a file that tried to be both would be the wrong shape for
   * each.
   */
  exportDisposals(): Promise<string>;
}

export interface NewsRepository {
  briefing(): Promise<NewsItem[]>;
}

/**
 * Yield — PLAN.md 12.17 [G35].
 *
 * The handoff quotes 12.6% APY on Home, in Activity and in the Briefing. The live figure derived
 * from Solana's own inflation schedule is materially lower. The app shows the LIVE number: an
 * app that advertises a rate it cannot deliver is the thing copy.md's "never oversell" rule
 * exists to prevent.
 */
/** Live perp metrics — PLAN.md 12.15 [G37]. Screen 25's 2x2 grid was static in the handoff. */
export type PerpMetrics = {
  symbol: string;
  markPx: number;
  oraclePx: number;
  markVsIndex: number;
  /**
   * Null where xorr cannot know it.
   *
   * These three need a venue's own order book, and xorr does not run one. Null so the screen can
   * say "not available" — a plausible number here is the kind a perp trader would act on.
   */
  openInterestUsd: number | null;
  dayVolumeUsd: number | null;
  fundingRate: number | null;
  maxLeverage: number;
  nextFundingSeconds: number;
  /** Absolute unix ms — the client counts down from this, purely. */
  nextFundingAt: number;
  feed: 'live';
};

export interface PerpRepository {
  metrics(symbol: string): Promise<PerpMetrics | null>;
}

export interface YieldRepository {
  /** `estimatedApy` is a FRACTION (0.0388 = 3.88%), not percentage points. */
  staking(): Promise<{ estimatedApy: number; feed: 'live' | 'simulated'; note: string } | null>;
}

export interface AlertRepository {
  list(): Promise<Alert[]>;
  /** Persist a new alert. It used to be built on screen and discarded. */
  create(input: {
    kind: 'price' | 'agent' | 'risk';
    symbol?: string;
    name: string;
    detail?: string;
    config?: Record<string, unknown>;
  }): Promise<Alert>;
  setEnabled(id: string, enabled: boolean): Promise<void>;
}

export interface WalletRepository {
  current(): Promise<Wallet | null>;
  createEmbedded(): Promise<Wallet>;
  connect(address: string): Promise<Wallet>;
  delegation(): Promise<Delegation | null>;
  /** What Privy enforces on this wallet — read from Privy, not from our own record of it. */
  privyPolicy(): Promise<PrivyPolicyView | null>;
  /**
   * NOTE: there is deliberately no grant/revoke here.
   *
   * Those are transactions the USER signs with their own Privy wallet (src/auth/useGrantDelegation).
   * A repository method would imply the server could do it, and the whole safety claim rests on
   * the fact that it cannot.
   */
  balance(): Promise<{ sol: number; usd: number }>;
}

export type Repositories = {
  markets: MarketRepository;
  bot: BotRepository;
  strategies: StrategyRepository;
  portfolio: PortfolioRepository;
  activity: ActivityRepository;
  news: NewsRepository;
  yield: YieldRepository;
  perps: PerpRepository;
  alerts: AlertRepository;
  wallet: WalletRepository;
  orders: OrderRepository;
};
