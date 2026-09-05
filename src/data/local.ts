/**
 * Local repository implementation.
 *
 * Not a mock: market data is REAL (CoinGecko + Jupiter, src/data/marketData.ts). What is local is
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
import { fetchCandles, fetchQuotes, type Quote } from './marketData';
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

export const LocalRepositories: Repositories = {
  markets: {
    async listClasses(): Promise<AssetClass[]> {
      // Overlay live quotes onto the crypto class; other classes keep feed:'simulated'.
      const live = await fetchQuotes(
        assetClasses.find((c) => c.id === 'crypto')?.instruments.map((i) => i.sym) ?? [],
      ).catch((): Record<string, Quote> => ({}));
      return assetClasses.map((c) => ({
        ...c,
        instruments: c.instruments.map((i) => {
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
      const live = await fetchQuotes(symbols).catch((): Record<string, Quote> => ({}));
      const out: Record<string, { price: number; change24h: number } | undefined> = {};
      for (const s of symbols) {
        const q = live[s];
        out[s] = q ? { price: q.price, change24h: q.change24h } : undefined;
      }
      return out;
    },

    async candles(symbol: string, timeframe: Timeframe): Promise<Candles> {
      const live = await fetchCandles(symbol, timeframe).catch(() => null);
      if (live) return live;
      // No feed for this symbol means NO CHART. Handing back another asset's bars under this
      // symbol's name would be the most misleading thing this app could do.
      return { symbol, timeframe, bars: [], feed: 'simulated' };
    },
  },

  bot: {
    async listAgents(): Promise<Agent[]> {
      // The same source the leaderboard uses. The roster previously showed fixture metrics
      // ("61% win rate") beside a leaderboard reporting the real zeros — two numbers for the
      // same fact, one of them invented.
      const remote = await api.get<Agent[]>('/agents/leaderboard').catch(() => undefined);
      if (remote && remote.length > 0) return remote;
      // With no server, show the roster WITHOUT performance claims rather than fabricated ones.
      return agentFixtures.map((a) => ({ ...a, metric: 'No record yet', pnl30d: 0, win: 0, trades: 0 }));
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
      const remote = await api
        .get<{ estimatedApy: number; feed: 'live'; note: string }>('/staking/yield')
        .catch(() => undefined);
      // No live rate means no rate. Quoting the design's number would be advertising a yield we
      // have not verified.
      return remote ?? null;
    },
  },

  alerts: {
    async list(): Promise<Alert[]> {
      // A fixed catalogue of alert types is product CONFIG, not market data — legitimately local.
      return alertFixtures;
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
    async grantDelegation(params) {
      return api.post<Delegation>('/delegation/grant', params);
    },
    async revokeDelegation() {
      return api.post<Delegation>('/delegation/revoke', {});
    },
    async balance() {
      return api.get<{ sol: number; usd: number }>('/wallet/balance');
    },
  },
};
