/**
 * Local repository implementation.
 *
 * Not a mock: market data is REAL — CoinGecko for crypto and a live 1inch route for the
 * tokenized equities, both through the executor (src/data/marketData.ts). What is local is
 * the *account* — positions, strategies, the audit trail — which lives in the executor's Postgres
 * once the server is reachable, and falls back to the on-device store when it is not.
 *
 * Anything without a real feed is returned with feed:'simulated' so the UI can label it.
 * PLAN.md §1.3 item 8: "Never present synthetic data as live."
 */
import { assetClasses } from './fixtures/markets';
import { agentFixtures } from './fixtures/agents';
import { sleeveFixtures } from './fixtures/sleeves';
import {
  StillWarming,
  fetchCandles,
  fetchQuotes,
  fetchSparklines,
  fetchStockQuotes,
  type Quote,
  type StockQuote,
} from './marketData';
import { ApiError, NotSignedIn, api, apiReason } from './api';
import { absentOrThrow } from './apiError';
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
import type {
  OrderOutcome,
  PerpMetrics,
  PositionClose,
  Repositories,
} from './repositories';
import { percent, price as fmtPrice } from '../format';

const allInstruments: Instrument[] = assetClasses.flatMap((c) => c.instruments);

/** Which symbols are tokenized equities, and therefore priced by the venue rather than a feed. */
const STOCK_SYMBOLS = new Set(
  assetClasses.find((c) => c.id === 'stocks')?.instruments.map((i) => i.sym) ?? [],
);

export const LocalRepositories: Repositories = {
  markets: {
    async listClasses(): Promise<AssetClass[]> {
      /*
       * Ask for EVERY symbol, not just the crypto class.
       *
       * This asked only for `crypto`, so an instrument filed under another class kept the
       * fixture's price however real its feed was. Gold is the case that made it visible: XAUT
       * has a genuine `tether-gold` feed on the server, and the commodities tab showed the
       * handoff's $3,412.10 under a SIMULATED tag while gold traded near $4,420. The tag was
       * honest and the number was a thousand dollars wrong, which is the failure the tag exists
       * to prevent, not an acceptable use of it.
       *
       * `/market/quotes` already drops symbols it has no feed for, so asking for all of them
       * costs nothing — it is one cache hit on one URL — and everything genuinely unpriced
       * (silver, crude, the indices) still falls through to its indicative price and keeps the
       * label. The tokenized equities come from a real 1inch route instead, because that is the
       * venue that would actually fill them.
       */
      const [live, stocks] = await Promise.all([
        fetchQuotes(allInstruments.map((i) => i.sym)).catch((): Record<string, Quote> => ({})),
        fetchStockQuotes().catch((): Record<string, StockQuote> => ({})),
      ]);
      return assetClasses.map((c) => ({
        ...c,
        instruments: c.instruments.map((i) => {
          const s = stocks[i.sym];
          if (s) {
            // No 24h change: a swap quote is a spot price, and inventing a delta from one
            // observation would be the same class of lie as a hardcoded price.
            return s.price === null
              ? { ...i, px: '—', chg: '', feed: 'simulated' as const }
              : { ...i, px: fmtPrice(s.price), chg: '', feed: 'live' as const };
          }
          const q = live[i.sym];
          if (!q) {
            /*
             * An instrument that HAS a live feed and did not answer shows a dash, not the design's
             * price.
             *
             * Falling back to the fixture put BTC on screen at $66,560 — the handoff's 2024 number
             * — under a SIMULATED tag while the real price was $79,880. The tag satisfies the
             * letter of "real or labelled" and not one bit of its intent: a confident, specific,
             * twenty-percent-wrong price is the failure that rule exists to prevent. An instrument
             * that never had a feed keeps its indicative price, which is what the label is for.
             */
            return i.feed === 'live'
              ? { ...i, px: '—', chg: '', feed: 'simulated' as const }
              : i;
          }
          return {
            ...i,
            px: fmtPrice(q.price),
            chg: percent(q.change24h, { digits: 2 }),
            up: q.change24h >= 0,
            feed: 'live' as const,
          };
        }),
      }));
    },

    async getInstrument(symbol) {
      return allInstruments.find((i) => i.sym === symbol) ?? null;
    },

    async quotes(symbols) {
      // Two feeds, one answer. Crypto is priced by CoinGecko; the tokenized equities have no
      // CoinGecko listing and are priced off the 1inch route that would fill them. A screen asking
      // for a price should not have to know which kind of asset it is holding.
      const needsStocks = symbols.some((s) => STOCK_SYMBOLS.has(s));
      let warming = false;
      const [live, stocks] = await Promise.all([
        fetchQuotes(symbols).catch((e: unknown): Record<string, Quote> => {
          warming = e instanceof StillWarming;
          return {};
        }),
        needsStocks
          ? fetchStockQuotes().catch((): Record<string, StockQuote> => ({}))
          : Promise.resolve({} as Record<string, StockQuote>),
      ]);
      const out: Record<
        string,
        { price: number; change24h?: number; warming?: boolean } | undefined
      > = {};
      for (const s of symbols) {
        const stock = stocks[s];
        if (stock?.price != null) {
          // A swap quote is one observation. No 24h delta exists, so none is reported — a 0 here
          // would read as "unchanged today", which is a claim we have not measured.
          out[s] = { price: stock.price };
          continue;
        }
        const q = live[s];
        out[s] = q
          ? { price: q.price, change24h: q.change24h }
          : warming
            ? { price: 0, change24h: undefined, warming: true }
            : undefined;
      }
      return out;
    },

    async sparklines(symbols: string[]): Promise<Record<string, number[]>> {
      // Empty on failure, not an error: a row without its glyph is a row, and a market list that
      // refuses to render because a decoration is unavailable is the wrong trade.
      return (await fetchSparklines(symbols).catch(() => undefined)) ?? {};
    },
    async candles(symbol: string, timeframe: Timeframe): Promise<Candles> {
      let warming = false;
      const live = await fetchCandles(symbol, timeframe).catch((e: unknown) => {
        // "Not yet" and "not ever" are different answers and the screen shows different words.
        warming = e instanceof StillWarming;
        return null;
      });
      if (live) return live;
      if (warming) return { symbol, timeframe, bars: [], feed: 'warming' };
      // No feed for this symbol means NO CHART. Handing back another asset's bars under this
      // symbol's name would be the most misleading thing this app could do.
      return { symbol, timeframe, bars: [], feed: 'simulated' };
    },
  },

  bot: {
    async listAgents(): Promise<Agent[]> {
      // The persisted roster: who is hired, how they are configured, and their real metrics. The
      // roster used to read hired-ness from browser state and metrics from a fixture, so the same
      // fact had two answers and one of them was invented.
      const remote = await api.get<Agent[]>('/agents').catch(() => undefined);
      if (remote && remote.length > 0) return remote;
      // With no server, show the roster WITHOUT performance claims rather than fabricated ones.
      return agentFixtures.map((a) => ({
        ...a,
        metric: 'No record yet',
        pnl30d: 0,
        win: 0,
        trades: 0,
        hired: false,
      }));
    },
    async hire(personaId: string): Promise<Agent> {
      return api.post<Agent>('/agents', { personaId });
    },
    async fire(agentId: string): Promise<{ pausedStrategies: number }> {
      return api.del<{ pausedStrategies: number }>(`/agents/${agentId}`);
    },
    async updateAgent(agentId, patch): Promise<Agent> {
      return api.patch<Agent>(`/agents/${agentId}`, patch);
    },
    async currentProposal(): Promise<Proposal | null> {
      // No fixture fallback: a proposal the user could approve must be a real one the server
      // stands behind, or there is none.
      return (await api.get<Proposal | null>('/proposals/current').catch(() => null)) ?? null;
    },
    async generateProposal() {
      /*
       * A `warming` 503 is a WAIT, not a failure.
       *
       * The agent prices every tradable asset to reach a decision, and on a cold cache the
       * executor now bounds that at ten seconds and answers 503 with a Retry-After rather than
       * letting the browser abandon the request — which it did, at twenty-two seconds, reporting
       * it as a CORS error. Treating that 503 like any other error put "I could not reach the
       * market just now" on the Bot tab, which is false: the market was reached, and the answer
       * was seconds away.
       *
       * Waited out the same way `marketData.ts` waits out its own warming 503s, and for the same
       * reason: the work continues server-side, so the retry is the one that reads a warm cache.
       */
      type Generated =
        | ({ created: true; id: string; agent: string; expiresAt: number } & Record<string, string>)
        | { created: false; reason: string; detail: string };

      let res: Generated | null = null;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          res = await api.post<Generated>('/proposals/generate', {});
          break;
        } catch (e) {
          const warming = e instanceof ApiError && e.status === 503;
          if (!warming || attempt === 3) break;
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
      if (!res) return { proposal: null, declined: 'I could not reach the market just now.' };
      if (!res.created) return { proposal: null, declined: res.detail };
      const { created, ...rest } = res;
      return { proposal: rest as unknown as Proposal };
    },
    async decideProposal(id, decision) {
      // A decision must reach the server or it did not happen. Reporting a local "filled" for a
      // request that never landed is the worst possible lie on this screen.
      return api.post<{ message: string }>(`/proposals/${id}/decide`, { decision });
    },
    async backtest(agentId, lookback): Promise<BacktestResult> {
      // No fallback: a backtest is a performance claim. Showing a designer's numbers when the
      // engine is unreachable would be exactly the overselling copy.md forbids.
      return api.get<BacktestResult>(`/agents/${agentId}/backtest?lookback=${lookback}`);
    },
    async leaderboard(): Promise<Agent[]> {
      // Same reasoning as backtest: a leaderboard is a performance claim.
      return api.get<Agent[]>('/agents/leaderboard');
    },
    async ask({ agentId, question, tone }) {
      const res = await api
        .post<{ text: string | null; source: 'model' | 'none' }>('/bot/say', {
          persona: agentId,
          situation: `The user asks: "${question}". Answer in one or two sentences, without naming any figure.`,
          tone,
        })
        .catch(() => undefined);
      /*
       * An unreachable server is not a model that declined, so it does not claim to be one.
       *
       * `source: 'none'` says the same thing the server says when no model wrote a line, and the
       * text names the actual condition — the request failed — rather than putting words in an
       * agent's mouth about a market it never looked at.
       */
      return (
        res ?? {
          text: 'I cannot reach my own reasoning right now, so I will not guess.',
          source: 'none' as const,
        }
      );
    },
  },

  strategies: {
    async setState(id, state) {
      return api.patch<Strategy>(`/strategies/${id}`, { state });
    },
    async runNow(id) {
      return api.post<{ status: string; reason?: string; units?: number; price?: number }>(
        `/strategies/${id}/run`,
        {},
      );
    },
    /** Same distinction as `portfolio.positions` — "none running" is not "could not ask". */
    async list(): Promise<Strategy[]> {
      try {
        return await api.get<Strategy[]>('/strategies');
      } catch (e) {
        if (e instanceof NotSignedIn) return [];
        throw e;
      }
    },
    async create(s) {
      /*
       * Say what the executor said.
       *
       * This was `.catch(() => undefined)` followed by "The strategy service is unreachable —
       * nothing was created", which is the one sentence that is almost never true. A refusal
       * arrives as a 400 with a written reason — the daily cap, an equity that cannot settle on
       * this chain, a buy of the token the buy is paid in — and all of it was thrown away and
       * reported as the backend being down. Watched on a simulator: `POST /strategies 400` in
       * 304ms, and the screen blamed the network.
       *
       * `apiReason` is the same unwrapping `/orders` already does, and for the same reason: the
       * difference between a user who changes the amount and a user who retries forever.
       */
      try {
        return await api.post<Strategy>('/strategies', s);
      } catch (e) {
        const reason = apiReason(e);
        if (reason) throw new Error(reason);
        // Genuinely no sentence to report — a transport failure, or a body without one.
        throw new Error(
          e instanceof ApiError
            ? `The strategy service refused this (${e.status}) and gave no reason.`
            : 'The strategy service is unreachable — nothing was created.',
        );
      }
    },
    async pause(id) {
      return api.post<Strategy>(`/strategies/${id}/pause`, {});
    },
    async resume(id) {
      return api.post<Strategy>(`/strategies/${id}/resume`, {});
    },
    async end(id) {
      return api.post<Strategy>(`/strategies/${id}/end`, {});
    },
  },

  orders: {
    async place(input): Promise<OrderOutcome> {
      // A 409 is a POLICY refusal, not a transport failure — the body carries the reason the
      // user needs to read, so it is unwrapped rather than thrown as "409".
      try {
        return await api.post<OrderOutcome>('/orders', input);
      } catch (e) {
        if (e instanceof ApiError && e.body && typeof e.body === 'object') {
          const b = e.body as Partial<OrderOutcome>;
          if (b.status) return b as OrderOutcome;
        }
        throw e;
      }
    },
  },

  portfolio: {
    /*
     * An empty list means the wallet holds nothing. It must not also mean "the read failed".
     *
     * This was `.catch(() => undefined) ?? []`, which turned every failure — a 500, a timeout, a
     * dropped connection — into a confident empty portfolio. On /swap that renders as "Balance
     * 0.0000" and "You hold no WETH. There is nothing to swap." to someone holding 0.4890 WETH,
     * and `useAsync` never sees an error, so no screen can tell the two apart or offer a retry.
     * The whole app draws the absent-versus-not-known line carefully and this one line erased it
     * underneath every screen that reads positions.
     *
     * `NotSignedIn` is the exception the catch was actually written for: no session means no
     * positions, which genuinely is an empty list and not a failure. That one stays swallowed;
     * everything else now reaches the screen.
     */
    async positions(): Promise<Position[]> {
      try {
        return await api.get<Position[]>('/positions');
      } catch (e) {
        if (e instanceof NotSignedIn) return [];
        throw e;
      }
    },
    async position(id) {
      return (await api.get<Position | null>(`/positions/${id}`).catch(() => undefined)) ?? null;
    },
    async sleeves(): Promise<Sleeve[]> {
      // The three sleeves are product config, not measured data — legitimately local.
      return sleeveFixtures;
    },
    async balanceUsd(): Promise<number | null> {
      /*
       * `null` when the executor could not be reached, and it matters.
       *
       * Returning 0 put "TOTAL VALUE $0.00" on the home screen of a funded wallet whenever the
       * server was down — a specific, confident, wrong number, which is the one thing this app is
       * not allowed to show. A dash says "I do not know", which is the truth.
       */
      const b = await api.get<{ usd: number }>('/wallet/balance').catch(() => undefined);
      return b ? b.usd : null;
    },
    async realised() {
      // No fallback. An invented profit figure is the single worst number this app could show.
      return api.get<{
        total: number;
        bySymbol: {
          symbol: string;
          realised: number;
          unitsSold: number;
          proceeds: number;
          basisIncomplete: boolean;
        }[];
      }>('/pnl/realised');
    },
    async balance() {
      const b = await api
        .get<{
          usd: number;
          cashUsd: number;
          suppliedUsd?: number;
          holdings?: { symbol: string; units: number; usd: number }[];
        }>('/wallet/balance')
        .catch(() => undefined);
      if (!b) return null;
      return {
        total: b.usd,
        cash: b.cashUsd,
        supplied: b.suppliedUsd ?? 0,
        // Was dropped here. See the note on the interface — it cost two screens their agreement.
        holdings: b.holdings ?? [],
      };
    },
    async close(input): Promise<PositionClose> {
      // No catch. A sale that did not happen must surface on the screen that asked for it —
      // a swallowed failure here reads to the user as a completed exit.
      try {
        return await api.post<PositionClose>('/positions/close', input);
      } catch (e) {
        if (e instanceof ApiError && e.body && typeof e.body === 'object') {
          const b = e.body as Partial<PositionClose>;
          if (b.status) return b as PositionClose;
        }
        throw e;
      }
    },
  },

  activity: {
    async list(): Promise<ActivityEvent[]> {
      // The audit trail is the compliance artifact. A fabricated row in it would be worse than
      // an empty screen, so there is no fallback — an empty trail shows the empty state.
      return api.get<ActivityEvent[]>('/activity');
    },
    async exportTrail(format) {
      return api.getText(`/activity/export?format=${format}`);
    },
    async exportDisposals() {
      return api.getText('/pnl/disposals.csv');
    },
  },

  news: {
    async briefing(): Promise<NewsItem[]> {
      // Real headlines or none. Stale hand-written news presented as today's briefing is a lie
      // with a timestamp on it.
      return api.get<NewsItem[]>('/briefing');
    },
  },

  perps: {
    async metrics(symbol) {
      // No live metrics means the screen says so. It never falls back to the design's figures.
      return (
        (await api.get<PerpMetrics | null>(`/perp/${symbol}`).catch(() => undefined)) ?? null
      );
    },
  },

  yield: {
    async staking() {
      // Reads the live USDC supply rate on Aave v3 (Base). No live rate means no rate — quoting
      // the design's 12.6% would be advertising a yield nobody verified.
      const remote = await api
        .get<{
          symbol: string;
          estimatedApy: number;
          feed: 'live';
          note: string;
          availableHere?: boolean;
        }>('/yield/supply')
        .catch(() => undefined);
      return remote ?? null;
    },
  },

  alerts: {
    async list(): Promise<Alert[]> {
      /*
       * The user's own alerts, persisted. Nothing else.
       *
       * A thrown request is an outage and the screen already knows how to say so — that part was
       * right. What was wrong was the other half: an empty list fell through to a "starting
       * catalogue" of fixtures, defended in the old comment here as product config rather than a
       * stand-in for saved state. It was not either.
       *
       *   - It listed `NVDAx earnings` and `SOL above $95`. This app's tokenized Nvidia is
       *     `NVDAc`; `NVDAx` is the design prototype's spelling, which `fixtures/markets.ts` warns
       *     about in its own header. SOL is not settleable on Base at all. So the catalogue
       *     offered to watch two things that do not exist here.
       *   - The header counted them: "2 of 5 on", stated about alerts nobody had set.
       *   - The switches were live. Toggling one called `setEnabled` with a fixture id the server
       *     has never seen, and `setEnabled` swallows its own failure — so the row flipped, the
       *     store remembered it, and nothing was ever armed. A user could leave that screen
       *     believing they had an alert on their position.
       *
       * A new user has no alerts. The screen says so and offers the button that makes one.
       */
      return api.get<Alert[]>('/alerts');
    },
    async create(input: {
      kind: 'price' | 'agent' | 'risk';
      symbol?: string;
      name: string;
      detail?: string;
      config?: Record<string, unknown>;
    }): Promise<Alert> {
      return api.post<Alert>('/alerts', input);
    },
    async setEnabled(id, enabled) {
      await api.post(`/alerts/${id}`, { enabled }).catch(() => undefined);
    },
  },

  wallet: {
    async current(): Promise<Wallet | null> {
      /*
       * `null` only when the server says so. A failed read THROWS.
       *
       * This swallowed every error into `null`, which is the same value the server returns for "no
       * wallet" — so a moment's network trouble was indistinguishable from not having an account.
       * The entry gate redirects to onboarding on a null wallet, so that ambiguity could bounce a
       * signed-in user out of their own session to recover from a blip.
       */
      return await api.get<Wallet | null>('/wallet');
    },
    async createEmbedded(): Promise<Wallet> {
      return api.post<Wallet>('/wallet/create', {});
    },
    async connect(address) {
      return api.post<Wallet>('/wallet/connect', { address });
    },
    /**
     * The permission itself. A failure THROWS; only "there is no grant" returns null.
     *
     * This swallowed every error into `null`, which made "the executor did not answer" and "this
     * wallet has granted nothing" the same value — and `/safety` reads exactly this to decide
     * between them. With the executor unreachable and a live $1,600/day grant on chain, the
     * screen announced **NOT GRANTED · "No permission has been granted, so nothing can trade."**
     *
     * The screen was given a fifth state for this, and it could never reach it: the error had
     * already been destroyed one layer down. So the distinction is restored where it is made.
     *
     * `NotSignedIn` still returns null, because a signed-out visitor genuinely has no permission —
     * an answer rather than a failure to get one — and the route itself returns null before a
     * grant exists, which is the other legitimate null.
     */
    async delegation(): Promise<Delegation | null> {
      return absentOrThrow(() => api.get<Delegation | null>('/delegation'));
    },
    async privyPolicy(): Promise<PrivyPolicyView | null> {
      // Null on failure rather than throwing: this is a second opinion about safety, and a screen
      // that cannot render because the extra reassurance is unavailable is worse than one that
      // shows the lock it can read.
      return (await api.get<PrivyPolicyView>('/privy/policy').catch(() => undefined)) ?? null;
    },
  },
};
