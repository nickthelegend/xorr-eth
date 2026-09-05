# xorr — build plan

A builder agent should be able to pick any single task below and execute it without reading
anything else first. Every task states the file, the expected behaviour, and how to prove it.

Repo: `/Volumes/Extreme SSD/Projects/xorr-eth`. Stack: Expo SDK 57 / RN 0.86 web+native,
Hono + Postgres executor, Foundry contracts on Base, two subgraphs.

Status legend: **DONE** · **IN PROGRESS** · **NOT STARTED** · **BLOCKED**

---

## 1. What "done" and "winning" mean here

### 1.1 The product claim, in one sentence
A bot trades your capital while you get on with your life, and the only thing standing between it
and your money is a permission **you signed and can take back**, enforced by a contract rather than
by our server.

Everything below is subordinate to that. A feature that cannot be checked by the user against the
chain is not finished, however good it looks.

### 1.2 Done — the product bar
1. A stranger can go from cold start to a running strategy without leaving the app: sign in, get a
   wallet, sign a scoped permission, pick a market, start a recurring buy, watch it fill.
2. Every market in the design's five classes renders with either a real price or an explicit
   SIMULATED tag. No number on screen is invented.
3. The candlestick chart is the centrepiece the design says it is: real OHLC, green bull bodies and
   red bear bodies with the bloom, on every timeframe pill, for every instrument with a feed.
4. Agents are objects with a lifecycle — hire, configure, run, measure, fire — that survives a
   reinstall because it lives in the database, not in browser state.
5. Every tier of the strategy ladder marked `available` has a creation screen AND an executor
   branch that can actually run it. A tier with a screen and no executor is worse than no tier.
6. The kill switch works with the server switched off, because it is a transaction the user signs.
7. Zero console errors from this codebase on every route. Third-party noise is attributed, not
   excused.

### 1.3 Winning — the four hackathons
This repo targets **ETH Online 2026** and **Base Build Camp 2026** from one codebase. OKX Dev Day
and Monad Metropolis get their own repos (Phase 9).

| Sponsor | The bar they actually set | Where we stand |
|---|---|---|
| 1inch — Build an Aqua App ($7k) | Official Aqua contracts, on-chain execution, real git history. SwapVM scored higher. | Aqua **done** (22 fork tests). SwapVM **not built** — the biggest single scoring gap. |
| The Graph ($15k) | Load-bearing, and explicitly *not* "simply querying one Subgraph". | Load-bearing **done**. Second subgraph built + pinned, **not deployed**. |
| Privy | Auth + embedded wallets doing real work. | **Done** end to end — a real embedded wallet signs the on-chain grant. |
| Base Build Camp | Real users, real transactions on Base. | Contract live on Base Sepolia; fills proven on a Base mainnet fork. |

### 1.4 The rule that settles arguments
From the design handoff, and it has already caught five bugs in this repo: **every price on screen
is real, or it is labelled.** When a number cannot be measured, show a dash and say why. A
confident wrong number is the worst outcome available.

---

## 2. Where the project is now

**Working and verified** (254 automated checks green: 143 app · 42 server · 36 contract · 33 live):
Privy auth + embedded wallet, user-signed on-chain grant and revoke, contract-enforced daily cap /
expiry / venue allowlist, 1inch routing, Aqua book with delegated fills, two subgraphs (one
deployed), 17 live crypto + tokenized-equity markets, real 1inch fills on a Base mainnet fork.

**Not working:** SwapVM, agent persistence, ladder tiers 2–7 execution, three endpoints the app
calls that do not exist, 27 of 44 markets simulated, no screenshots, no git remote.

---

## 3. Phases

### Phase 0 — Ship what already works · **IN PROGRESS**
Nothing below matters if the work is not pushed and legible.

| # | Task | Status |
|---|---|---|
| 0.1 | `git remote add origin <url>` on `xorr-eth`, push `main`. **BLOCKED**: no remote is configured and no URL has been provided. Needs a GitHub repo to exist — `gh repo create xorr-finance/xorr-eth --private --source=. --push` once the org/name is settled. | **BLOCKED** |
| 0.2 | Rewrite `README.md`: fix the stale "9 live tests" (now 33) and "400 USDC/day" (now 1,600), add the Base-mainnet-fork story, add the two-environment table from `docs/TESTPLAN.md`. | NOT STARTED |
| 0.3 | Capture a PNG of every one of the 41 routes at 402×874 into `docs/screens/`, via the browser tools against `:8082` with a logged-in session. Name them `NN-route-name.png`. | NOT STARTED |
| 0.4 | Add a "Every screen" section to `README.md` — a table of all 41 screens, each with its route, one-line purpose, and its screenshot inline. Group by Onboarding / Tabs / Markets / Trading / Agents / Safety / Dev. | NOT STARTED |
| 0.5 | Record a 60-second demo GIF: sign in → grant → create a recurring buy → watch a fill on the fork → revoke. Link from the README top. | NOT STARTED |
| 0.6 | `.env.example` must list every var the code now reads: `AQUA_SUBGRAPH_URL`, `AQUA_BOOK_ADDRESS`, `FORK_RPC`, `DELEGATE_PRIVATE_KEY`, `HTTP_MIN_SPACING_MS`, `SCHEDULER_TICK_MS`. Verify by grepping `process.env` across `server/src`. | NOT STARTED |

### Phase 1 — Close the sponsor gaps · **NOT STARTED**
The two items that cost prize points.

| # | Task | Status |
|---|---|---|
| 1.1 | Create the `xorr-aqua` subgraph slug in Subgraph Studio (dashboard action), then `cd subgraph-aqua && npx graph deploy xorr-aqua --version-label v0.0.1`. Build is already pinned: `QmctadHCDBprb9Q1Pq4oyMXjB6KcnUDHRheDRNyBA59tAJ`. | **BLOCKED** on the dashboard click |
| 1.2 | Set `AQUA_SUBGRAPH_URL` in `.env`, restart the executor, confirm `/agent/decision` returns `route.venue: "aqua"` when a deep book exists. Proves the two-index join for The Graph composable track. | BLOCKED on 1.1 |
| 1.3 | Add `server/src/graph/aqua.live.test.ts`: assert `_meta.hasIndexingErrors === false` and that `openBooks()` returns rows, mirroring `decide.live.test.ts`. | BLOCKED on 1.1 |
| 1.4 | **SwapVM program.** Read `contracts/lib/aqua` for the SwapVM interface. Write `contracts/src/XorrSwapVMStrategy.sol` — a bytecode program that gates a fill on the maker's oracle band, so `XorrAquaBook`'s price check runs *inside* SwapVM instead of in Solidity. | NOT STARTED |
| 1.5 | `contracts/test/XorrSwapVM.fork.t.sol` against the real SwapVM on the Base mainnet fork: a program that permits an in-band fill and one that rejects an out-of-band fill, both asserted on real balances. | NOT STARTED |
| 1.6 | Wire `XorrAquaBook` to execute through SwapVM when a program is set, falling back to the Solidity path when it is not. Keep all 22 existing fork tests green. | NOT STARTED |
| 1.7 | README section: "How this uses Aqua and SwapVM" — the composition diagram and the exact contract addresses, so a judge can verify in one read. | NOT STARTED |

### Phase 2 — Make the app take trades for real · **NOT STARTED**
The executor can fill on the fork. The app cannot yet drive that end to end.

| # | Task | Status |
|---|---|---|
| 2.1 | Add `POST /strategies/:id/run` — trigger one run of a strategy now, returning the same shape as a scheduled run. Needed so a demo does not wait for a cadence. | NOT STARTED |
| 2.2 | Wire a "Run now" action into `app/(tabs)/strategies.tsx` on each running strategy row, disabled while a run is in flight, showing the fill or the `humanFailure` message inline. | NOT STARTED |
| 2.3 | Add a `base-fork` app profile: `EXPO_PUBLIC_API_URL` pointing at a fork-mode executor, so the app can be demoed against a chain that can actually settle. Document the two-terminal startup in `docs/RUNBOOK.md`. | NOT STARTED |
| 2.4 | Deploy `XorrDelegation` + `XorrAquaBook` to the Base mainnet fork on startup (a `server/src/fork-bootstrap.ts`), write the addresses to `.env.fork`, so the fork demo is one command. | NOT STARTED |
| 2.5 | Fund the demo wallet on the fork automatically (impersonate the Aave aUSDC reserve, as `fork-e2e.ts` already does) so a fresh fork has a spendable balance. | NOT STARTED |
| 2.6 | End-to-end on the fork through the UI: grant → create recurring buy → Run now → position appears in `/holdings` with the real fill price → `/activity` shows it → `/history` shows the tx. Record as `e2e/06-fork-fill.yaml`. | NOT STARTED |
| 2.7 | `POST /positions` write path: `applyFill` already exists in `server/src/positions/index.ts`; confirm a fork fill produces a `positions` row and that `/holdings` renders it with real P&L. | NOT STARTED |

### Phase 3 — Agents become real objects · **NOT STARTED**
Today `toggleHire` is zustand state in the browser. Hiring an agent persists nothing.

| # | Task | Status |
|---|---|---|
| 3.1 | Add an `agents` table to `server/src/db/schema.sql`: `id, wallet_id, persona_id, name, hired, tone, risk_limits jsonb, created_at`. One row per hired agent per wallet. | NOT STARTED |
| 3.2 | `GET /agents` returns this wallet's agents joined with `leaderboard()` metrics. `POST /agents` hires one from a `PERSONAS` id. `PATCH /agents/:id` updates tone and limits. `DELETE /agents/:id` fires it. | NOT STARTED |
| 3.3 | Replace `useStore.hired` with the server as the source of truth in `app/bot/roster.tsx`. Keep an optimistic local toggle for responsiveness, reconciled on the response. | NOT STARTED |
| 3.4 | `app/bot/[id]/settings.tsx` currently renders limits that go nowhere — POST them to `PATCH /agents/:id` and read them back on mount. | NOT STARTED |
| 3.5 | Bind a strategy to the agent that owns it: add `agent_id` to `strategies`, set it at creation, and show the owning agent on each strategy row. | NOT STARTED |
| 3.6 | `app/bot/leaderboard.tsx` must rank the wallet's *own* agents with real P&L, win rate and trade count from `strategy_runs`. Fire-the-laggard action calls `DELETE /agents/:id`. | NOT STARTED |
| 3.7 | Tests: `server/src/agents/agents.test.ts` — hiring twice is idempotent, firing stops the agent's strategies, and an agent belongs to exactly one wallet (no cross-wallet read). | NOT STARTED |

### Phase 4 — The strategy ladder, executable · **NOT STARTED**
`src/strategies/ladder.ts` marks tiers 1–3 available. Only tier 1 has a screen, and
`runStrategy` never branches on `kind` — it buys, whatever the strategy says.

| # | Task | Status |
|---|---|---|
| 4.1 | Make `runStrategy` dispatch on `strategy.kind` with an explicit `default:` that fails loudly rather than silently buying. Today every kind executes as a DCA buy. | NOT STARTED |
| 4.2 | **Tier 2 — Rebalance.** `kind: 'rebalance'`. Executor: read positions, compare to target weights in `params`, emit the smallest set of trades that closes the drift beyond a threshold. Screen: `app/strategy/rebalance.tsx` with weight steppers summing to 100. | NOT STARTED |
| 4.3 | **Tier 3 — Take profit / stop loss.** `kind: 'auto-close'`. Executor: on each tick, compare mark to the TP/SL bands and close the position when crossed. Screen exists at `app/auto-close/[id].tsx` but the ladder routes to `/auto-close/current`, which is not a real id — fix the route to pick the position. | NOT STARTED |
| 4.4 | **Tier 4 — Idle cash to yield.** `kind: 'yield'`. Supply idle USDC to Aave v3 on Base; `server/src/market/yield.ts` already reads the rate. Flip `available: true` only once the executor branch exists. | NOT STARTED |
| 4.5 | **Tier 5 — Range accumulation.** `kind: 'range'`. Buy on a band touch, sized from `decide()`'s remaining cap. | NOT STARTED |
| 4.6 | **Tier 6 — Momentum.** `kind: 'momentum'`. The backtest engine in `server/src/backtest/engine.ts` already replays real history; reuse its signal for live execution. | NOT STARTED |
| 4.7 | **Tier 7 — Events and earnings.** `kind: 'event'`. Gate on the news feed in `server/src/news/feed.ts`. | NOT STARTED |
| 4.8 | Every new kind needs a `StrategyInput` schema branch validating its `params`, so a malformed rebalance is a 400 and not a runtime failure at 3am. | NOT STARTED |
| 4.9 | Per-kind executor tests in `server/src/executor/` — each asserts the trades produced for a known position set, and that a kind with no branch fails loudly. | NOT STARTED |

### Phase 5 — Every market, properly · **NOT STARTED**
17 of 44 instruments have a real feed. 27 are SIMULATED: 9 commodities, 9 indices, 9 pre-IPO.

| # | Task | Status |
|---|---|---|
| 5.1 | **Commodities.** Checked: 1inch's Base token list returns **nothing** for XAUT or PAXG, so tokenized gold is not on Base. CL/BZ/HG/PL/PA/NG/ZW are futures with no token at all. Either find a gold token that actually routes on Base (search the 1inch token API before writing any code) or keep all nine SIMULATED and put the reason in the class note. Do not ship a Buy button here. | NOT STARTED |
| 5.2 | **Indices.** Candidates exist on Base — `SPY.d`/`aSPY`/`wtSPYM`, `QQQ.d`/`aQQQ` — but existing is not the same as routable: the Dinari `.d` tokens returned INSUFFICIENT_LIQUIDITY when the stocks registry was built, which is why that registry uses Ondo's `0xb2000…` family. **First step is a liquidity probe**, not an integration: for each candidate, `GET /swap/v6.1/8453/quote?src=USDC&dst=<addr>&amount=100000000` and keep only the ones that quote. Then repeat the `stocks.ts` process — registry entry, live test, price from a real route. Drop the rest rather than showing a dead row. | NOT STARTED |
| 5.3 | **Pre-IPO.** OPENAI/ANTHRP/SPACEX have no on-chain instrument. Keep SIMULATED, and make the class note say plainly that these are not tradable here — do not let a Buy button exist on them. | NOT STARTED |
| 5.4 | Gate the Buy CTA on `isTradable(symbol)` from `src/data/tradable.ts` on `app/asset/[symbol].tsx` and `app/markets/[classId].tsx`. A SIMULATED instrument shows "Not tradable on Base" instead. | NOT STARTED |
| 5.5 | Extend `TRADABLE` and the executor `TOKENS` registry with whatever 5.1 and 5.2 add, keeping `tradable.live.test.ts` green (it fails if client and server drift). | NOT STARTED |
| 5.6 | `app/markets/[classId].tsx` counts: the header says "9 markets" from the fixture length. Make it count what actually rendered, so dropping a dead instrument does not leave a lying header. | NOT STARTED |
| 5.7 | The `/watchlist` groups still carry `JUP` and a `Total` row with no feed. Replace with symbols that price, or drop them. | NOT STARTED |

### Phase 6 — Charts: bull and bear candles everywhere · **NOT STARTED**
`src/charts/Candlestick.tsx` renders `pnl.candleUp` / `pnl.candleDown` bodies with the bloom
correctly, and is used on 3 of 7 chart surfaces. `app/asset/[symbol].tsx` uses an area chart.

| # | Task | Status |
|---|---|---|
| 6.1 | Add a candles/area toggle to `app/asset/[symbol].tsx`, defaulting to candles when `fetchCandles` returns bars. The bars are already fetched — only the renderer is an area chart. | NOT STARTED |
| 6.2 | `app/perp/[symbol].tsx` renders from `src/data/fixtures/series` — switch it to real candles via `repos.markets.candles()`, with the SIMULATED tag when there is none. | NOT STARTED |
| 6.3 | `app/bot/[id]/backtest.tsx` draws an equity curve from `backtestFixtures`; the engine already returns a real series. Render that instead. | NOT STARTED |
| 6.4 | Use the two documented projections correctly: `tight` for the pro chart, `wide` for Auto Close. Using one for both is a known bug — add a test in `src/charts/project.test.ts` asserting the two produce different geometry for the same bars. | NOT STARTED |
| 6.5 | Serve candles for the tokenized equities. There is no CoinGecko series for them; build one by sampling `/market/stocks` into a `stock_prices` table on the scheduler tick, then serve OHLC from it. Until then the asset screen honestly says "no price history". | NOT STARTED |
| 6.6 | Volume row: `src/charts/VolumeRow.tsx` exists and is unused. Wire it under the candles on `app/chart/[symbol].tsx` with real volume from the OHLC feed, or delete it. | NOT STARTED |
| 6.7 | Visual test: render 12 known bars and assert every up candle uses `pnl.candleUp` and every down candle `pnl.candleDown`, with the P&L colour law never inverted. | NOT STARTED |

### Phase 7 — The three endpoints the app calls that do not exist · **NOT STARTED**
Each currently 404s and the screen degrades. They are silent holes.

| # | Task | Status |
|---|---|---|
| 7.1 | `GET /perp/:symbol` — funding rate, open interest, max leverage, `nextFundingAt` as an absolute unix ms. `app/perp/[symbol].tsx` already expects this shape. Source from a real perp venue or return `feed: 'simulated'` explicitly. | NOT STARTED |
| 7.2 | `POST /alerts/:id` — persist the enabled flag. Add an `alerts` table; `src/data/local.ts` calls this and swallows the failure. | NOT STARTED |
| 7.3 | `POST /alerts` — create an alert from `app/alerts/new.tsx`, which currently builds one and discards it. | NOT STARTED |
| 7.4 | Delete the dead `/staking/yield` reference: `src/data/local.ts:252` now calls `/yield/supply`; confirm no caller of the old path remains. | NOT STARTED |
| 7.5 | Add a route-coverage test: enumerate every path the client calls (grep `api.get`/`api.post` in `src/data/local.ts`) and assert each returns non-404 with a valid token. This class of bug should never recur. | NOT STARTED |

### Phase 8 — Polish, performance, correctness · **NOT STARTED**

| # | Task | Status |
|---|---|---|
| 8.1 | Stale comment in `src/data/local.ts:4` still says "CoinGecko + Jupiter". Jupiter was removed with the Solana pivot. | NOT STARTED |
| 8.2 | Native build: `@privy-io/expo` is native-only and the provider is platform-split. Run the app on the iOS simulator and fix what web hid. Nothing native has been executed this cycle. | NOT STARTED |
| 8.3 | Reduced-motion and 9.5px font-floor checks pass as unit tests but have never been verified on device. | NOT STARTED |
| 8.4 | The LLM voice gate reports "free-tier daily quota exhausted — contract not measurable in this run". Either fund a model or mark the test skipped-with-reason rather than passing vacuously. | NOT STARTED |
| 8.5 | Rate limiting on the executor's public `/market/*` routes — they are unauthenticated and proxy a rate-limited upstream. | NOT STARTED |
| 8.6 | `DELEGATE_PRIVATE_KEY` lives in a file (`server/.keys/delegate.key`). `server/src/evm/client.ts` says this is inadequate beyond a local fork; document the KMS path in `docs/SECURITY.md` before any mainnet use. | NOT STARTED |
| 8.7 | Deploy the executor somewhere the phone can reach (Railway), set `EXPO_PUBLIC_API_URL`, and confirm the app works off localhost. | NOT STARTED |

### Phase 9 — The other three hackathons · **NOT STARTED**

| # | Task | Status |
|---|---|---|
| 9.1 | `xorr-okx` repo: fork the app + executor, swap the venue adapter for OKX DEX API, keep XorrDelegation. Does not exist yet. | NOT STARTED |
| 9.2 | `xorr-monad` repo: deploy XorrDelegation to Monad, integrate Kuru as the venue. Does not exist yet. | NOT STARTED |
| 9.3 | Extract the shared core (contracts, delegation client, design system) so three repos do not become three divergent codebases. | NOT STARTED |
| 9.4 | Base Build Camp submission: same repo as ETH Online, different README framing — lead with Base-native assets and the tokenized-equity story. | NOT STARTED |

---

## 4. Gap audit

Every gap ties to the task it blocks. Found by reading the code and running it, not the README.

### 4.1 Blocking a sponsor track
| Gap | Evidence | Blocks |
|---|---|---|
| SwapVM entirely absent | No file references SwapVM outside `lib/aqua` | 1.4–1.7 |
| Second subgraph not deployed | `graph deploy` → "Subgraph not found"; slug needs creating in Studio | 1.1–1.3 |
| No git remote on `xorr-eth` | `git remote -v` is empty | 0.1 |

### 4.2 Features that look built and are not
| Gap | Evidence | Blocks |
|---|---|---|
| Hiring an agent persists nothing | `toggleHire` is zustand only (`src/state/store.ts:208`); no `agents` table | 3.1–3.7 |
| `runStrategy` ignores `strategy.kind` | No `.kind` branch anywhere in `server/src/executor/run.ts` — every strategy runs as a DCA buy | 4.1 |
| Ladder tiers 2–3 marked available with no path | `ladder.ts` routes tier 2 → `/(onboarding)/proposal`, tier 3 → `/auto-close/current` (not a real id); no executor branch for either | 4.2, 4.3 |
| Agent settings screen writes nowhere | `app/bot/[id]/settings.tsx` has no POST | 3.4 |
| Alert creation discards the alert | `app/alerts/new.tsx` builds and drops it | 7.3 |
| `GET /perp/:symbol` 404s | Verified with a valid token | 7.1 |
| `POST /alerts/:id` 404s | Verified; `local.ts` swallows it with `.catch(() => undefined)` | 7.2 |
| `VolumeRow` written and never rendered | No importer outside `charts/index.ts` | 6.6 |

### 4.3 Data that is not real
| Gap | Evidence | Blocks |
|---|---|---|
| 27 of 44 instruments simulated | commodities 0/9 live, indices 0/9, pre-IPO 0/9 | 5.1–5.3 |
| Perp screen draws fixture series | `app/perp/[symbol].tsx` imports `fixtures/series` | 6.2 |
| Backtest equity curve is a fixture | `app/bot/[id]/backtest.tsx` uses `backtestFixtures` while the engine returns a real series | 6.3 |
| Watchlist carries symbols with no feed | `JUP`, `Total` in `fixtures/series.ts` | 5.7 |
| No OHLC for tokenized equities | Priced from a swap quote, which is one observation | 6.5 |
| Agent roster metrics are zeroed fixtures | `local.ts:132` maps `agentFixtures` to `'No record yet'` | 3.6 |

### 4.4 Verification gaps
| Gap | Evidence | Blocks |
|---|---|---|
| Nothing has run on a real device | `@privy-io/expo` native path never executed | 8.2 |
| LLM voice contract not measurable | Free-tier quota exhausted; the test passes without measuring | 8.4 |
| No route-coverage test | Three 404s reached production-shaped code undetected | 7.5 |
| No screenshots exist | `ui/mobile-ui/reference` holds 2 files, neither an image | 0.3, 0.4 |
| Public market routes unauthenticated and unlimited | `PUBLIC_PATHS` in `auth/middleware.ts` | 8.5 |

### 4.5 Cosmetic / stale
| Gap | Evidence | Blocks |
|---|---|---|
| README claims "9 live tests", "400 USDC/day" | Actually 33 and 1,600 | 0.2 |
| `local.ts` docblock cites Jupiter | Removed with the Solana pivot | 8.1 |
| `.env.example` missing 6 vars the code reads | `AQUA_SUBGRAPH_URL`, `AQUA_BOOK_ADDRESS`, `FORK_RPC`, `DELEGATE_PRIVATE_KEY`, `HTTP_MIN_SPACING_MS`, `SCHEDULER_TICK_MS` | 0.6 |
| Market class header counts the fixture, not the render | `app/markets/[classId].tsx` | 5.6 |

**Grep sweep:** 44 hits for mock/stub/TODO/fake/dummy/placeholder. All but two are innocuous — HTML
`placeholder` attributes, the `Placeholder` skeleton component, the deliberate `react-native-stub`
for Node tests, and comments explaining what is *not* a mock. The two real ones are 4.5's stale
Jupiter docblock and the `feed: 'simulated'` instruments in 4.3. **No TODO or FIXME exists in the
codebase.**

---

## 5. Suggested order

Phase 0 first — the work is invisible until it is pushed and screenshotted. Then Phase 1 (prize
points, and 1.1 is one dashboard click). Then Phase 2, because "the app takes a trade end to end"
is the demo everything else hangs off. Phases 3–7 in parallel if there is more than one builder;
they touch different files. Phase 8 before any mainnet exposure. Phase 9 last — it is three more
products, not three more features.
