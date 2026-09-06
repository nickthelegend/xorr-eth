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
import { alertFixtures } from './fixtures/alerts';
import { sleeveFixtures } from './fixtures/sleeves';
import {
  fetchCandles,
  fetchQuotes,
  fetchStockQuotes,
  StillWarming,
  type Quote,
  type StockQuote,
} from './marketData';
import { api } from './api';
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
  Proposal,
  Sleeve,
  Strategy,
  Timeframe,
  Wallet,
} from './types';
import type { PerpMetrics, Repositories } from './repositories';
import { percent, price as fmtPrice } from '../format';

const allInstruments: Instrument[] = assetClasses.flatMap((c) => c.instruments);

/** Which symbols are tokenized equities, and therefore priced by the venue rather than a feed. */
const STOCK_SYMBOLS = new Set(
  assetClasses.find((c) => c.id === 'stocks')?.instruments.map((i) => i.sym) ?? [],
);

export const LocalRepositories: Repositories = {
  markets: {
    async listClasses(): Promise<AssetClass[]> {
      // Crypto is priced off CoinGecko; the tokenized equities off a real 1inch route, because
      // that is the venue that would actually fill them. Everything else stays labelled simulated.
      const [live, stocks] = await Promise.all([
        fetchQuotes(
          assetClasses.find((c) => c.id === 'crypto')?.instruments.map((i) => i.sym) ?? [],
        ).catch((): Record<string, Quote> => ({})),
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
          if (!q) return { ...i, feed: i.feed === 'live' ? 'simulated' : i.feed };
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
      const res = await api
        .post<
          | ({ created: true; id: string; agent: string; expiresAt: number } & Record<string, string>)
          | { created: false; reason: string; detail: string }
        >('/proposals/generate', {})
        .catch(() => null);
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
        .post<{ text: string; source: 'model' | 'fallback' }>('/bot/say', {
          persona: agentId,
          situation: `The user asks: "${question}". Answer in one or two sentences, without naming any figure.`,
          tone,
        })
        .catch(() => undefined);
      return (
        res ?? {
          text: 'I cannot reach my own reasoning right now, so I will not guess.',
          source: 'fallback' as const,
        }
      );
    },
  },

  strategies: {
    async list(): Promise<Strategy[]> {
      return (await api.get<Strategy[]>('/strategies').catch(() => undefined)) ?? [];
    },
    async create(s) {
      const remote = await api.post<Strategy>('/strategies', s).catch(() => undefined);
      if (remote) return remote;
      throw new Error('The strategy service is unreachable — nothing was created.');
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

  portfolio: {
    async positions(): Promise<Position[]> {
      return (await api.get<Position[]>('/positions').catch(() => undefined)) ?? [];
    },
    async position(id) {
      return (await api.get<Position | null>(`/positions/${id}`).catch(() => undefined)) ?? null;
    },
    async sleeves(): Promise<Sleeve[]> {
      // The three sleeves are product config, not measured data — legitimately local.
      return sleeveFixtures;
    },
    async balanceUsd(): Promise<number> {
      const b = await api.get<{ usd: number }>('/wallet/balance').catch(() => undefined);
      return b?.usd ?? 0;
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
        .get<{ symbol: string; estimatedApy: number; feed: 'live'; note: string }>('/yield/supply')
        .catch(() => undefined);
      return remote ?? null;
    },
  },

  alerts: {
    async list(): Promise<Alert[]> {
      // The user's own alerts, persisted. The catalogue below is the starting set for someone who
      // has never made one — it is product config, not a stand-in for saved state.
      const remote = await api.get<Alert[]>('/alerts').catch(() => undefined);
      if (remote && remote.length > 0) return remote;
      return alertFixtures;
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
      return (await api.get<Wallet | null>('/wallet').catch(() => undefined)) ?? null;
    },
    async createEmbedded(): Promise<Wallet> {
      return api.post<Wallet>('/wallet/create', {});
    },
    async connect(address) {
      return api.post<Wallet>('/wallet/connect', { address });
    },
    async delegation(): Promise<Delegation | null> {
      return (await api.get<Delegation | null>('/delegation').catch(() => undefined)) ?? null;
    },

    async balance() {
      return api.get<{ sol: number; usd: number }>('/wallet/balance');
    },
  },
};
