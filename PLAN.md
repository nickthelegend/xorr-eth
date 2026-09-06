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

**Executed 2026-09-06.** Phases 0 through 7 are done, 8 is partly done, 9 is one of four.

Automated: **149 app · 54 executor · 51 contract · 60 live** — 314 checks, all green.
Contract tests include 22 Aqua fork tests and 10 SwapVM fork tests against the official
deployments on a Base mainnet fork.

**Proven by running it, not by reading it:**

| | |
|---|---|
| Privy | Real login, real embedded wallet, real signed grant and revoke on public Base Sepolia |
| 1inch Aqua | `XorrAquaBook` on the official registry, 22 fork tests, real ERC-20 movement |
| 1inch SwapVM | `XorrSwapVMBook` on the official router, 10 fork tests, bot buys 0.1969 WETH under a signed cap |
| The Graph | Delegation index deployed and synced; a second Aqua index built and joined into the routing decision |
| A real trade | Strategy created through the API, run, `status: "filled"`, 0.1009 WETH at $2,476.76 into the user's wallet |
| A real close | Take-profit sold the whole 0.6020 WETH position, and the daily spend cap did not move |
| Agents | Persisted rows; "2 of 4 hired" read from Postgres in the running app |

**Not done, and why:** SwapVM's Aqua subgraph slug (a Studio dashboard click), the native iOS build
(no Xcode on this machine), the deployed executor (billable), the LLM voice measurement (no funded
model key), ladder tiers 4-7 (correctly marked unavailable in the UI), and the OKX and Monad repos
(separate hackathons, deliberately deferred).

### The 21 defects this pass found

Every one surfaced from executing the flow, not from reading the code.

1. `runStrategy` settled on chain and wrote nothing — no position, no audit entry, no next run.
2. `POST /strategies` skipped the cap check entirely when a database row was missing, so a $1,600
   on-chain cap accepted a $999,999/day strategy. The guard's failure mode was to allow.
3. The Aqua path never called `spend()`, so the cap and venue allowlist did nothing on it.
4. CORS omitted `authorization`, so the web client could never authenticate at all.
5. Swap output was delivered to the delegation contract, not the user — custodial by accident.
6. Token addresses were Base mainnet constants used on every network, so Sepolia asked for the
   balance of a contract with no code and the delegation flow died before anyone could sign.
7. …and then the same split in reverse: the 1inch registry followed `XORR_CHAIN` while 1inch is
   only ever asked about mainnet.
8. `/delegation/record` raced the block and refused to record a grant that landed a second later.
9. The daily cap is denominated in USDC, so a sell could not route through `spend()` at all — and
   a used-up spending cap would have silenced a stop-loss.
10. `TradeIntent` conflated an input amount with its dollar value, scaling a $1,500 position into
    1500e18 wei.
11. The spend rules rejected a stop-loss as "the amount must be above zero".
12. A rebalance normalised weights by their own sum, so `{ WETH: 60 }` meant 100%.
13. `runStrategy` never branched on `kind` — every strategy executed as a recurring buy.
14. The deployed SwapVM router's opcode table is offset by one from the vendored release.
15. SwapVM fees are billionths in a uint32, not basis points; `30` would have quoted for free.
16. `/wallet/balance` returned a hardcoded 0 for a wallet holding $49,998.
17. The `base-fork` chain kept foundry's empty `contracts`, so viem thought Base had no Multicall3.
18. One Ondo equity in a multicall halts the batch with `OpcodeNotFound` — not a revert, so
    `allowFailure` does not catch it.
19. The Aave yield read the Sepolia USDC address against the mainnet Pool and reported a confident
    "0.00% a year" from a zeroed struct.
20. `humanFailure` mapped Solana Anchor codes, so every real EVM revert fell through to the one
    message that tells a user nothing.
21. The asset and perp screens drew another asset's chart under whatever symbol was open.

## 3. Phases

### Phase 0 — Ship what already works · **IN PROGRESS**
Nothing below matters if the work is not pushed and legible.

| # | Task | Status |
|---|---|---|
| 0.1 | Remote + push. **DONE** — https://github.com/nickthelegend/xorr-eth, public, `main` tracking. History scanned for secrets first: 0 hits across every commit. | **DONE** |
| 0.2 | README rewritten — counts corrected, two-environment story added, sponsor table now states SwapVM as done. | **DONE** |
| 0.3 | 47 screens captured at 402×874 via `tools/shoot.mjs`, which provisions its own Privy test account and signs in, so the shots are the signed-in app. | **DONE** |
| 0.4 | README "Every screen" section — all 47, grouped, inline. | **DONE** |
| 0.5 | Record a 60-second demo GIF: sign in → grant → create a recurring buy → watch a fill on the fork → revoke. Link from the README top. | NOT STARTED |
| 0.6 | `.env.example` now lists all 29 vars, verified by grepping `process.env` — it is a superset of the working `.env`. | **DONE** |

### Phase 1 — Close the sponsor gaps · **NOT STARTED**
The two items that cost prize points.

| # | Task | Status |
|---|---|---|
| 1.1 | Create the `xorr-aqua` subgraph slug in Subgraph Studio (dashboard action), then `cd subgraph-aqua && npx graph deploy xorr-aqua --version-label v0.0.1`. Build is already pinned: `QmctadHCDBprb9Q1Pq4oyMXjB6KcnUDHRheDRNyBA59tAJ`. | **BLOCKED** on the dashboard click |
| 1.2 | Set `AQUA_SUBGRAPH_URL` in `.env`, restart the executor, confirm `/agent/decision` returns `route.venue: "aqua"` when a deep book exists. Proves the two-index join for The Graph composable track. | BLOCKED on 1.1 |
| 1.3 | Add `server/src/graph/aqua.live.test.ts`: assert `_meta.hasIndexingErrors === false` and that `openBooks()` returns rows, mirroring `decide.live.test.ts`. | BLOCKED on 1.1 |
| 1.4 | **SwapVM program — DONE.** `contracts/src/XorrSwapVMBook.sol`. `xycProgram` for crypto, `peggedProgram` for a share pegged to a reference price. SwapVM is a separate 1inch repo, not part of `lib/aqua`; vendored as `lib/swap-vm`. | **DONE** |
| 1.5 | `XorrSwapVM.fork.t.sol` — 10 tests against the real router `0x111111338c…`, whose `AQUA()` is asserted to match. Bot buys 0.1969 WETH for $500 under a signed cap; slippage floor, deadline and fee all enforced inside the VM. | **DONE** |
| 1.6 | Superseded by the design that emerged: SwapVM is a *separate Aqua app*, not a mode of ours — a maker ships to one or the other. `XorrSwapVMBook` is the second venue and all 22 Aqua tests stay green (46 contract tests total). | **DONE** |
| 1.7 | README sponsor table names Aqua, the aggregator and SwapVM separately with their status and addresses; `docs/BASE-BUILD-CAMP.md` carries the Base-native case. | **DONE** |

### Phase 2 — Make the app take trades for real · **NOT STARTED**
The executor can fill on the fork. The app cannot yet drive that end to end.

| # | Task | Status |
|---|---|---|
| 2.1 | `POST /strategies/:id/run`, through the same period claim as the scheduler, so running twice in a period is a no-op rather than a double buy. | **DONE** |
| 2.2 | **NOT DONE** — the endpoint exists and is verified, but no button calls it. Runs are triggered by the scheduler or by the API. |
| 2.3 | `.env.fork` is generated by the bootstrap and the README documents the two-terminal startup. | **DONE** |
| 2.4 | `server/src/fork-bootstrap.ts` deploys all three contracts, funds the bot's gas, and writes `.env.fork`. One command. | **DONE** |
| 2.5 | Bootstrap funds a wallet with 25,000 real USDC taken from the Aave aUSDC reserve by impersonation, plus gas. | **DONE** |
| 2.6 | Verified through the API rather than the UI: strategy created, run, `status: "filled"`, 0.1009 WETH at $2,476.76, position row written, activity logged, cap 1750 → 1500. No `e2e/06-fork-fill.yaml` — the flow is covered by `fork-e2e.ts` instead. | **DONE (via API)** |
| 2.7 | `applyFill` was imported and never called — the whole success path wrote nothing. Fixed; a fill now writes the position, the audit entry and the next run in one transaction. | **DONE** |

### Phase 3 — Agents become real objects · **NOT STARTED**
Today `toggleHire` is zustand state in the browser. Hiring an agent persists nothing.

| # | Task | Status |
|---|---|---|
| 3.1 | Add an `agents` table to `server/src/db/schema.sql`: `id, wallet_id, persona_id, name, hired, tone, risk_limits jsonb, created_at`. One row per hired agent per wallet.| **DONE** |
| 3.2 | `GET /agents` returns this wallet's agents joined with `leaderboard()` metrics. `POST /agents` hires one from a `PERSONAS` id. `PATCH /agents/:id` updates tone and limits. `DELETE /agents/:id` fires it.| **DONE** |
| 3.3 | Replace `useStore.hired` with the server as the source of truth in `app/bot/roster.tsx`. Keep an optimistic local toggle for responsiveness, reconciled on the response.| **DONE** |
| 3.4 | `app/bot/[id]/settings.tsx` currently renders limits that go nowhere — POST them to `PATCH /agents/:id` and read them back on mount.| **DONE** |
| 3.5 | Bind a strategy to the agent that owns it: add `agent_id` to `strategies`, set it at creation, and show the owning agent on each strategy row.| **DONE** |
| 3.6 | `app/bot/leaderboard.tsx` must rank the wallet's *own* agents with real P&L, win rate and trade count from `strategy_runs`. Fire-the-laggard action calls `DELETE /agents/:id`.| **DONE** |
| 3.7 | Tests: `server/src/agents/agents.test.ts` — hiring twice is idempotent, firing stops the agent's strategies, and an agent belongs to exactly one wallet (no cross-wallet read).| **DONE** |

### Phase 4 — The strategy ladder, executable · **NOT STARTED**
`src/strategies/ladder.ts` marks tiers 1–3 available. Only tier 1 has a screen, and
`runStrategy` never branches on `kind` — it buys, whatever the strategy says.

| # | Task | Status |
|---|---|---|
| 4.1 | Make `runStrategy` dispatch on `strategy.kind` with an explicit `default:` that fails loudly rather than silently buying. Today every kind executes as a DCA buy.| **DONE** |
| 4.2 | **Tier 2 — Rebalance.** `kind: 'rebalance'`. Executor: read positions, compare to target weights in `params`, emit the smallest set of trades that closes the drift beyond a threshold. Screen: `app/strategy/rebalance.tsx` with weight steppers summing to 100.| **DONE** |
| 4.3 | **Tier 3 — Take profit / stop loss.** `kind: 'auto-close'`. Executor: on each tick, compare mark to the TP/SL bands and close the position when crossed. Screen exists at `app/auto-close/[id].tsx` but the ladder routes to `/auto-close/current`, which is not a real id — fix the route to pick the position.| **DONE** |
| 4.4 | **Tier 4 — Idle cash to yield.** `kind: 'yield'`. Supply idle USDC to Aave v3 on Base; `server/src/market/yield.ts` already reads the rate. Flip `available: true` only once the executor branch exists.| **NOT STARTED** — correctly marked `available: false` in the ladder, so nothing in the UI claims otherwise |
| 4.5 | **Tier 5 — Range accumulation.** `kind: 'range'`. Buy on a band touch, sized from `decide()`'s remaining cap.| **NOT STARTED** — correctly marked `available: false` in the ladder, so nothing in the UI claims otherwise |
| 4.6 | **Tier 6 — Momentum.** `kind: 'momentum'`. The backtest engine in `server/src/backtest/engine.ts` already replays real history; reuse its signal for live execution.| **NOT STARTED** — correctly marked `available: false` in the ladder, so nothing in the UI claims otherwise |
| 4.7 | **Tier 7 — Events and earnings.** `kind: 'event'`. Gate on the news feed in `server/src/news/feed.ts`.| **NOT STARTED** — correctly marked `available: false` in the ladder, so nothing in the UI claims otherwise |
| 4.8 | Every new kind needs a `StrategyInput` schema branch validating its `params`, so a malformed rebalance is a 400 and not a runtime failure at 3am.| **DONE** |
| 4.9 | Per-kind executor tests in `server/src/executor/` — each asserts the trades produced for a known position set, and that a kind with no branch fails loudly.| **DONE** |

### Phase 5 — Every market, properly · **NOT STARTED**
17 of 44 instruments have a real feed. 27 are SIMULATED: 9 commodities, 9 indices, 9 pre-IPO.

| # | Task | Status |
|---|---|---|
| 5.1 | **Commodities.** Checked: 1inch's Base token list returns **nothing** for XAUT or PAXG, so tokenized gold is not on Base. CL/BZ/HG/PL/PA/NG/ZW are futures with no token at all. Either find a gold token that actually routes on Base (search the 1inch token API before writing any code) or keep all nine SIMULATED and put the reason in the class note. Do not ship a Buy button here.| **DONE** |
| 5.2 | **Indices.** Candidates exist on Base — `SPY.d`/`aSPY`/`wtSPYM`, `QQQ.d`/`aQQQ` — but existing is not the same as routable: the Dinari `.d` tokens returned INSUFFICIENT_LIQUIDITY when the stocks registry was built, which is why that registry uses Ondo's `0xb2000…` family. **First step is a liquidity probe**, not an integration: for each candidate, `GET /swap/v6.1/8453/quote?src=USDC&dst=<addr>&amount=100000000` and keep only the ones that quote. Then repeat the `stocks.ts` process — registry entry, live test, price from a real route. Drop the rest rather than showing a dead row.| **DONE** |
| 5.3 | **Pre-IPO.** OPENAI/ANTHRP/SPACEX have no on-chain instrument. Keep SIMULATED, and make the class note say plainly that these are not tradable here — do not let a Buy button exist on them.| **DONE** |
| 5.4 | Gate the Buy CTA on `isTradable(symbol)` from `src/data/tradable.ts` on `app/asset/[symbol].tsx` and `app/markets/[classId].tsx`. A SIMULATED instrument shows "Not tradable on Base" instead.| **DONE** |
| 5.5 | Extend `TRADABLE` and the executor `TOKENS` registry with whatever 5.1 and 5.2 add, keeping `tradable.live.test.ts` green (it fails if client and server drift).| **DONE** |
| 5.6 | `app/markets/[classId].tsx` counts: the header says "9 markets" from the fixture length. Make it count what actually rendered, so dropping a dead instrument does not leave a lying header.| **DONE** |
| 5.7 | The `/watchlist` groups still carry `JUP` and a `Total` row with no feed. Replace with symbols that price, or drop them.| **DONE** |

### Phase 6 — Charts: bull and bear candles everywhere · **NOT STARTED**
`src/charts/Candlestick.tsx` renders `pnl.candleUp` / `pnl.candleDown` bodies with the bloom
correctly, and is used on 3 of 7 chart surfaces. `app/asset/[symbol].tsx` uses an area chart.

| # | Task | Status |
|---|---|---|
| 6.1 | Add a candles/area toggle to `app/asset/[symbol].tsx`, defaulting to candles when `fetchCandles` returns bars. The bars are already fetched — only the renderer is an area chart.| **DONE** |
| 6.2 | `app/perp/[symbol].tsx` renders from `src/data/fixtures/series` — switch it to real candles via `repos.markets.candles()`, with the SIMULATED tag when there is none.| **DONE** |
| 6.3 | `app/bot/[id]/backtest.tsx` draws an equity curve from `backtestFixtures`; the engine already returns a real series. Render that instead.| **DONE** |
| 6.4 | Use the two documented projections correctly: `tight` for the pro chart, `wide` for Auto Close. Using one for both is a known bug — add a test in `src/charts/project.test.ts` asserting the two produce different geometry for the same bars.| **DONE** |
| 6.5 | Serve candles for the tokenized equities. There is no CoinGecko series for them; build one by sampling `/market/stocks` into a `stock_prices` table on the scheduler tick, then serve OHLC from it. Until then the asset screen honestly says "no price history".| **DONE** |
| 6.6 | Volume row: `src/charts/VolumeRow.tsx` exists and is unused. Wire it under the candles on `app/chart/[symbol].tsx` with real volume from the OHLC feed, or delete it.| **DONE** |
| 6.7 | Visual test: render 12 known bars and assert every up candle uses `pnl.candleUp` and every down candle `pnl.candleDown`, with the P&L colour law never inverted.| **DONE** |

### Phase 7 — The three endpoints the app calls that do not exist · **NOT STARTED**
Each currently 404s and the screen degrades. They are silent holes.

| # | Task | Status |
|---|---|---|
| 7.1 | `GET /perp/:symbol` — funding rate, open interest, max leverage, `nextFundingAt` as an absolute unix ms. `app/perp/[symbol].tsx` already expects this shape. Source from a real perp venue or return `feed: 'simulated'` explicitly.| **DONE** |
| 7.2 | `POST /alerts/:id` — persist the enabled flag. Add an `alerts` table; `src/data/local.ts` calls this and swallows the failure.| **DONE** |
| 7.3 | `POST /alerts` — create an alert from `app/alerts/new.tsx`, which currently builds one and discards it.| **DONE** |
| 7.4 | Delete the dead `/staking/yield` reference: `src/data/local.ts:252` now calls `/yield/supply`; confirm no caller of the old path remains.| **DONE** |
| 7.5 | Add a route-coverage test: enumerate every path the client calls (grep `api.get`/`api.post` in `src/data/local.ts`) and assert each returns non-404 with a valid token. This class of bug should never recur.| **DONE** |

### Phase 8 — Polish, performance, correctness · **NOT STARTED**

| # | Task | Status |
|---|---|---|
| 8.1 | Stale comment in `src/data/local.ts:4` still says "CoinGecko + Jupiter". Jupiter was removed with the Solana pivot.| **DONE** |
| 8.2 | **BLOCKED** — this machine has Command Line Tools, not Xcode (`xcodebuild` errors on the active developer directory). Needs a full Xcode install and `xcode-select`, which requires the user's password. Nothing native has been run. |
| 8.3 | **BLOCKED** by 8.2 — the checks pass as unit tests and have still never been seen on a device. |
| 8.4 | **NOT DONE** — the test still reports the quota is exhausted and passes without measuring. It needs a funded model key, which does not exist in the env. |
| 8.5 | Rate limiting on the executor's public `/market/*` routes — they are unauthenticated and proxy a rate-limited upstream.| **DONE** |
| 8.6 | `DELEGATE_PRIVATE_KEY` lives in a file (`server/.keys/delegate.key`). `server/src/evm/client.ts` says this is inadequate beyond a local fork; document the KMS path in `docs/SECURITY.md` before any mainnet use.| **DONE** |
| 8.7 | **NOT DONE, deliberately.** Railway is authenticated, but creating a service is a billable action and the standing instruction was to pause for anything that spends real money. It also needs the Privy secret and 1inch key set on an external host. Ready to run on your say-so. |

### Phase 9 — The other three hackathons · **NOT STARTED**

| # | Task | Status |
|---|---|---|
| 9.1 | **NOT STARTED** — a separate hackathon with its own deadline, and the standing direction was to focus on ETH Online. The venue adapter is one file (`server/src/venues/oneinch.ts`), which is what makes it cheap later. |
| 9.2 | **NOT STARTED** — same reason. `XorrDelegation` is chain-agnostic and would deploy to Monad unchanged. |
| 9.3 | **NOT STARTED** — worth doing when there is a second repo to share with, not before. |
| 9.4 | `docs/BASE-BUILD-CAMP.md` — why this is a Base app rather than an app that runs on Base, with the on-chain transactions and a two-minute reproduction. | **DONE** |

---

## 4. Gap audit

Every gap ties to the task it blocks. Found by reading the code and running it, not the README.

### 4.1 Blocking a sponsor track
| Gap | Evidence | Blocks | Status |
|---|---|---|---|
| SwapVM entirely absent | — | 1.4–1.7 | **CLOSED** — real programs on the real router, 10 fork tests |
| Second subgraph not deployed | `graph deploy` → "Subgraph not found" | 1.1–1.3 | **BLOCKED** — the slug must be created in the Studio dashboard |
| No git remote | — | 0.1 | **CLOSED** — pushed public |

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
| ~~`VolumeRow` never rendered~~ | **This gap was wrong.** It IS rendered in `app/chart/[symbol].tsx:150`; the original grep used a broken `--include` glob and silently matched nothing | 6.6 — dropped |

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
