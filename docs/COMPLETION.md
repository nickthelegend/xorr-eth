# Completion audit — measured by running, not by reading

Method: drive the real app in a browser (Expo web at 402x874), read the rendered text, and check
every number against the live source behind it. A screen that renders but shows a hardcoded value
counts as NOT done.

## Baseline — before this pass

**64% (31.5 / 49 items)**

| Group | Score |
|---|---|
| Screens (29) | 17.5 / 29 |
| Infrastructure (6) | 5 / 6 |
| Integrations (9) | 6 / 9 |
| End-to-end flows (5) | 3 / 5 |

### Verified working
- Onboarding runs end to end in a browser: splash → goals → wallet → fund → delegate → proposal.
  Creating the wallet wrote a real row to Postgres; signing the permission produced a **finalized**
  Solana transaction (slot 20864, `err: null`); approving the portfolio created a real strategy.
- Postgres is real and survives a hard restart (58 audit rows before and after `brew services restart`).
- Activity, Briefing (live RSS), Markets (with SIMULATED tags), Strategies, Leaderboard, Backtest,
  Safety, Assets value, DCA setup all render real data.
- Asset detail and Pro chart show live prices and real derived axes.

### Gaps found by running
| # | Gap | Where | Kind |
|---|---|---|---|
| 1 | `/` renders the SPLASH, not the wallet home — two files claim the index route | `app/(onboarding)/index.tsx` + `app/(tabs)/index.tsx` | BROKEN |
| 2 | Bot chat is empty — `/proposals/current` returns null and nothing ever produces a proposal | `server/src/routes/extra.ts`, no agent runtime | BROKEN |
| 3 | Order ticket quotes SOL at a hardcoded $88.32 while SOL is $104.25 — the quantity shown is wrong | `src/state/derived.ts:80` | MOCKED + WRONG |
| 4 | Swap uses the same constant and a hardcoded "Best of 3 venues" | `app/swap.tsx:72,137` | MOCKED |
| 5 | Perp screen hardcodes price, open interest, 24h volume and mark-vs-index — a real Hyperliquid feed exists but is not wired | `app/perp/[symbol].tsx:75,141-143` | MOCKED |
| 6 | Position screen is entirely hardcoded (entry/mark/liq/funding/P&L) | `app/position/[id].tsx` | MOCKED |
| 7 | Nothing ever creates a position; `/positions` returns `[]` | `server/src/executor/run.ts` | MISSING |
| 8 | Asset detail position rows hardcoded (1,750.30 SOL / $81.14 / +$12,566) | `app/asset/[symbol].tsx` | MOCKED |
| 9 | Pro chart agent note is stale text citing "$65.2K shelf" while BTC is $80K | `app/chart/[symbol].tsx` | MOCKED + WRONG |
| 10 | Watchlist and Assets holdings use static fixture prices | `app/watchlist.tsx`, `app/(tabs)/assets.tsx` | MOCKED |
| 11 | Agent roster shows fixture metrics ("61% win rate") while the leaderboard correctly shows real zeros | `src/data/local.ts` | MOCKED |
| 12 | Executor has no authentication | `server/src/routes/` | MISSING |
| 13 | 3 screens never verified in a browser (agent intro, trade settings, Auto Close) | — | UNVERIFIED |
