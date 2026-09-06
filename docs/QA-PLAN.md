# QA plan

Every component and every flow, with the specific result that counts as correct. This is the
checklist; nothing is a pass because it looked fine.

**How each item is judged.** The stated expected result has to match exactly. "The button did
something" is not a pass. The console and the network are checked on every screen item, not only
the ones that look broken — a visible error anywhere fails the item.

**What is excused, and why.** Exactly two things, named rather than swallowed:

- Expo's dev server probes each route with a `HEAD` it then aborts, so every navigation records one
  `ERR_ABORTED` against the app's own origin. Counting those would fail all 47 screens for
  something Metro does on purpose.
- A `503` carrying `Retry-After` from `/market/*` is the documented warming handshake, not a
  failure. The client honours it; so do these checks.

Anything else — including a third-party SDK's own console error — fails the item and is attributed
rather than excused.

**Environment.** Executor on `:8788` against `XORR_CHAIN=base-fork` (an anvil fork of Base
mainnet), Expo web on `:8082`, Postgres `xorr_eth`, real Privy session from
`test_credentials`. Contracts on the fork and on public Base Sepolia.

---

## A — Screens (47 routes)

Each: renders its subject, no console error, no failed request, and the specific content below.

### A1 Onboarding

| # | Route | Correct means |
|---|---|---|
| A1.1 | `/welcome` | Wordmark, tagline, a preview card with a real total, blue CTA. The only screen using blue. |
| A1.2 | `/goals` | 5 goal chips multi-select, 3-up risk segmented, caption changes with the pick, summary line counts selections. |
| A1.3 | `/wallet` | Signed out: email field + "Email me a code". Signed in: four status circles green and "Continue — add funds". |
| A1.4 | `/fund` | Amount keypad, 4 preset pills, 3 funding methods, fee row that changes with method (1.5% on card only). |
| A1.5 | `/delegate` | Four consequence cards, cap stepper $200–$5,000, "Run for" options, one signing CTA. |
| A1.6 | `/proposal` | Three sleeves with weights summing to 100, stepper ±5, CTA disabled until the total is 100. |

### A2 Home and markets

| # | Route | Correct means |
|---|---|---|
| A2.1 | `/` | Total value from chain (not 0 for a funded wallet), Send/Swap/More, cash row, agents, a coin row with a live price, the Aave rate strip, the catch-up card when there is activity. |
| A2.2 | `/markets` | 5 class pills; the selected class lists 9 instruments; count line matches. |
| A2.3 | `/markets/crypto` | 9 crypto rows, each a real price or a SIMULATED tag. |
| A2.4 | `/markets/stocks` | 9 equity rows priced from a live 1inch route. |
| A2.5 | `/markets/commodities` | 9 rows, all tagged SIMULATED (no feed exists). |
| A2.6 | `/markets/indices` | 9 rows, all tagged SIMULATED. |
| A2.7 | `/markets/preipo` | 9 rows, all tagged SIMULATED. |
| A2.8 | `/watchlist` | Grouped rows with a sparkline where there is a feed, SIMULATED where there is not. |
| A2.9 | `/search` | Typing filters; a query matching nothing shows the empty state with the query echoed. |

### A3 Instrument

| # | Route | Correct means |
|---|---|---|
| A3.1 | `/asset/ETH` | Live price, candles, timeframe pills, Buy/Sell. Loading, warming and "no feed" are three distinct messages. |
| A3.2 | `/asset/NVDAc` | A real spot price and no chart — priced off the route that would fill it. The screen says so. |
| A3.3 | `/asset/NOPE` | Degrades with a stated message. No crash, no invented price. |
| A3.4 | `/chart/ETH` | Bull candles green, bear red, volume row, price axis from the live projection. Tapping a candle shows its O/H/L/C and dims the rest; changing timeframe clears it. |
| A3.5 | `/order/ETH` | Amount keypad, side toggle, a quote with a route, slippage row. |
| A3.6 | `/swap` | Two token selectors, live quote, named venues, fee and minimum-received. |
| A3.7 | `/perp/ETH` | Live mark, funding, open interest — or a stated absence. Never fabricated. |

### A4 Agents

| # | Route | Correct means |
|---|---|---|
| A4.1 | `/bot` | Chat thread, a proposal card with a LIVE countdown, Skip/Approve, composer. |
| A4.2 | `/bot/roster` | Agent cards with real hired state. |
| A4.3 | `/bot/leaderboard` | Bars sized from real numbers, re-sorting animates width only. |
| A4.4 | `/bot/momentum/intro` | Persona, what it does, hire CTA. |
| A4.5 | `/bot/momentum/settings` | Config controls bound to persisted values. |
| A4.6 | `/bot/momentum/backtest` | Real OHLC replay: return, drawdown, Sharpe, trades, an equity curve, and a disclaimer. |

### A5 Strategies

| # | Route | Correct means |
|---|---|---|
| A5.1 | `/strategies` | Running tab lists live strategies with next-run dates; Add-new tab lists 7 ladder tiers with tiers 1–5 actionable and 6–7 marked Later. |
| A5.2 | `/strategy/dca` | Keypad, asset segmented, cadence, next-three-runs preview, one CTA. |
| A5.3 | `/strategy/yield` | Live Aave APY, real spendable cash, "would move" reflecting cash minus buffer, "nothing" under the floor. |
| A5.4 | `/strategy/grid` | Live price, Suggest fills a band, ladder drawn with the price marked, backtest on demand reporting in-range %, and the range-break warning. |
| A5.5 | `/holdings` | Portfolio value, allocation bars, holdings with average entry, realised P&L card, wallet address with the LIVE chain. |
| A5.6 | `/position/:id` | Entry, mark, unrealised, units — all computed, none hardcoded. |
| A5.7 | `/auto-close/:id` | TP/SL rulers against a real series, or a stated absence. |
| A5.8 | `/activity` | Rows with dot classification, filters, explorer reference on on-chain rows, two export buttons. |
| A5.9 | `/history` | On-chain spends read from the subgraph, or an empty state with a next action. |
| A5.10 | `/inbox` | Messages, or an empty state with a next action. |
| A5.11 | `/briefing` | Real headlines from real feeds. Never stale hand-written news. |

### A6 Money movement and safety

| # | Route | Correct means |
|---|---|---|
| A6.1 | `/safety` | Live/Stopped state, three consequence cards, both parties named with full addresses, allowlist/recovery rows, the stop button, and the "sell everything" link. |
| A6.2 | `/flatten` | Preview lists what would be sold with values, states the slippage, and the cap note. Empty book says so. |
| A6.3 | `/yield` | Supplied balance, live APY, 25/50/All, and the statement that the bot cannot withdraw. |
| A6.4 | `/allowlist` | Addresses with cooling-off state. |
| A6.5 | `/send` | Allowlist-only destinations, and it says why. |
| A6.6 | `/alerts` | Alert switches with fired state, the bot's own notification switches, circuit-breaker note, add CTA. |
| A6.7 | `/alerts/new` | Kind segmented, symbol, level, save. |
| A6.8 | `/recovery` | Backup state, honest about what is and is not backed up. |
| A6.9 | `/settings` | Real settings bound to persisted state. |
| A6.10 | `/legal/terms` | Real document text. |

### A7 Verification and harness

| # | Route | Correct means |
|---|---|---|
| A7.1 | `/judge` | 15 claims, each PASS with an observed value; owner field pre-filled; Re-run works. |
| A7.2 | `/_dev/components` | Every design primitive rendered. |
| A7.3 | `/_dev/fidelity` | Design-fidelity harness. |
| A7.4 | `/_dev/boom` | Renders normally; the throw button is caught by the boundary and the tab bar survives. |

---

## B — API (65 endpoints)

| # | Item | Correct means |
|---|---|---|
| B1 | `GET /health` | 200 with `status`, per-dependency latency, `critical` flags, and `publicSurface`. |
| B2 | `GET /metrics` | Run counts, failure rate, spend today, gas — all derived from tables. |
| B3 | `GET /verify` | 15 checks, 0 failing, each with `observed` and `how`. Public. |
| B4 | `GET /verify?owner=garbage` | 400 `invalid_owner`, not a wall of red. |
| B5 | Auth on a protected route without a token | 401 with a reason logged server-side. |
| B6 | `GET /wallet` | The wallet plus the LIVE chain, distinct from the creation cluster. |
| B7 | `GET /wallet/balance` | `usd` = cash + supplied + holdings, to the cent. |
| B8 | `GET /delegation` | Cap, expiry, revoked, spent, allowlist READ FROM CHAIN, both Basenames. |
| B9 | `GET /delegation/params` | Venues include every venue the executor routes to. |
| B10 | `POST /strategies` valid | 201/200 and it appears in the list. |
| B11 | `POST /strategies` unrunnable kind | 400 naming the runnable kinds. |
| B12 | `POST /strategies` zero amount on a spending kind | 400. |
| B13 | `POST /strategies` over the cap | 400 `over_cap` with both numbers. |
| B14 | `POST /strategies/:id/run` twice in a period | Second is `already_ran_this_period`. |
| B15 | `PATCH /strategies/:id` | State change persists. |
| B16 | `DELETE /strategies/:id` | Ends it; history survives. |
| B17 | Another wallet's strategy id | 404, not 403. |
| B18 | Malformed JSON | 400 `invalid_json`, never 500. |
| B19 | Missing required field | 400 naming the field. |
| B20 | Idempotency-Key replay | Same response, `idempotent-replay: true`, one row created. |
| B21 | Idempotency-Key on a different path | 422 `idempotency_key_reused`. |
| B22 | `GET /activity` | Rows with kind, signature and explorer reference. |
| B23 | `GET /activity/verify` | Hash chain intact over every entry. |
| B24 | `GET /activity/export?format=csv` | Real CSV of the trail. |
| B25 | `GET /pnl/realised` | Per-symbol realised, `basisIncomplete` where relevant. |
| B26 | `GET /pnl/disposals.csv` | Header, one row per disposal with cost basis and method, total row. |
| B27 | `GET /positions` | Computed entry/mark/unrealised. |
| B28 | `GET /panic/preview` | Legs with values, dust threshold, slippage stated. |
| B29 | `POST /panic/flatten` | Sells each leg, reports per-leg, and the cap is unchanged. |
| B30 | `GET /yield/supply` | Live Aave APY, feed `live`, source cited. |
| B31 | `GET /yield/position` | Supplied balance, aToken, pool, availability. |
| B32 | `POST /yield/withdraw-calldata` | Calldata to the Pool with the OWNER as recipient; `usd:null` flags max. |
| B33 | `GET /alerts` | Alerts with `armed`, `lastFiredAt`, `fireCount`. |
| B34 | `POST /alerts` then `POST /alerts/evaluate` | Fires once; a second sweep is quiet. |
| B35 | `POST /alerts/:id` | Enable/disable persists. |
| B36 | `DELETE /alerts/:id` | Removed. |
| B37 | `GET|POST /notifications/prefs` | All kinds listed, default on, mute persists and suppresses. |
| B38 | `GET /catchup` + `POST /catchup/seen` | Summary since last seen; reading does not mark seen. |
| B39 | `GET /market/quotes` | Live prices, public. |
| B40 | `GET /market/ohlc` | Real bars. |
| B41 | `GET /market/symbols` | Tradable symbols. |
| B42 | `GET /market/tradable` | Registry matching the executor's. |
| B43 | `GET /market/stocks` | 8 equities with live prices. |
| B44 | `GET /market/crosscheck?symbol=ETH` | Two sources, spread under 5%. |
| B45 | `GET /market/crosscheck?symbol=BTC` | No on-chain price — not WETH's. |
| B46 | `GET /basename?name=` and `?address=` | Both directions resolve. |
| B47 | `GET /perp/:symbol` | Live metrics or stated absence. |
| B48 | `GET /price/:symbol` | Single price. |
| B49 | `GET /swap/quote` | Real route with named venues. |
| B50 | `GET /agents` + `POST /agents` | Hire is idempotent. |
| B51 | `PATCH /agents/:id`, `DELETE /agents/:id` | Config persists; firing pauses strategies rather than deleting. |
| B52 | `GET /agents/leaderboard` | Real numbers. |
| B53 | `GET /agents/:id/backtest` | Real OHLC replay. |
| B54 | `POST /strategies/backtest` grid | In-range %, buys, sells, what would still be held. |
| B55 | `POST /strategies/backtest` bad range | 400 `invalid_range`. |
| B56 | `GET /proposals/current`, `POST /proposals`, `/:id/decide`, `/generate` | Proposal lifecycle persists. |
| B57 | `POST /bot/say` | Real LLM reply or a stated absence. |
| B58 | `GET /briefing` | Real headlines. |
| B59 | `GET /graph/health`, `/graph/activity` | Subgraph synced; spends indexed. |
| B60 | `GET /limits`, `POST /limits/check` | Rule engine verdicts. |
| B61 | `POST /devices/register`, `POST /notify/test` | Device row; Expo API reached. |
| B62 | `GET /agent/decision` | The Graph decision with its reason. |
| B63 | `GET /x`, `POST /x` | Whatever this is, it answers or is removed. |
| B64 | Rate limit | 429 with Retry-After, per caller. |
| B65 | Request id | Generated, echoed, honoured from the caller. |

---

## C — Contracts and on-chain

| # | Item | Correct means |
|---|---|---|
| C1 | `XorrDelegation` deployed | Code at the address on both the fork and Base Sepolia. |
| C2 | `grant()` | Cap, expiry and venues stored; readable back. |
| C3 | `spend()` under the cap | Fills; the bought token lands in the USER's wallet. |
| C4 | `spend()` over the cap | Reverts `DailyCapExceeded`. |
| C5 | `spend()` at an ungranted venue | Reverts `VenueNotAllowed`. |
| C6 | `spend()` after expiry | Reverts `PolicyExpired`. |
| C7 | `spend()` after revoke | Reverts `PolicyRevoked`. |
| C8 | `spend()` from a non-delegate | Reverts `NotDelegate`. |
| C9 | `closePosition()` | Sells; does NOT consume the cap. |
| C10 | Venue revert bubbles | 1inch's own error survives instead of `VenueCallFailed`. |
| C11 | No custody | Contract holds zero of both tokens after a trade. |
| C12 | `revoke()` | Owner-only, immediate, no server involved. |
| C13 | Aave supply through `spend()` | aToken to the owner; contract keeps nothing. |
| C14 | Aave withdraw | User-signed; the bot has no aToken allowance. |
| C15 | `XorrAquaBook` on Aqua | Real ERC-20 movement, maker keeps inventory. |
| C16 | `XorrSwapVMBook` | Program bytecode; deadline and fee behaviourally enforced. |
| C17 | Tokenized equity purchase | Backed bNVDA under policy. |
| C18 | Full contract suite | Every test green. |

---

## D — External integrations

| # | Item | Correct means |
|---|---|---|
| D1 | Privy auth | Real session; token verified server-side. |
| D2 | Privy embedded wallet | Created on sign-up, is the on-chain owner. |
| D3 | 1inch quote | Real route, named protocols. |
| D4 | 1inch execution | Real fill on the fork. |
| D5 | 1inch spot price | Second source for the cross-check. |
| D6 | Aqua | Official deployment, real movement. |
| D7 | SwapVM | Program executed by the router. |
| D8 | The Graph — delegation | Synced, no indexing errors. |
| D9 | The Graph — composition | The decision names its route and reason. |
| D10 | CoinGecko | Live crypto prices via the executor. |
| D11 | Aave v3 | `currentLiquidityRate` from the Base Pool. |
| D12 | Ondo equities | 8 verified on Base with the right decimals. |
| D13 | Basenames | L2 resolver, both directions. |
| D14 | RSS briefing | Real headlines. |
| D15 | Expo push | Real API call; delivery needs a device credential. |

---

## E — Edge cases and interrupted flows

| # | Item | Correct means |
|---|---|---|
| E1 | Executor down | Screens state the error. Never a blank page or a fabricated number. |
| E2 | Cold price cache | 503 `warming` with Retry-After; the client retries. |
| E3 | Unknown symbol on every screen that takes one | Degrades with a message. |
| E4 | Zero-amount strategy | Rejected for a spending kind, allowed for a self-sizing one. |
| E5 | Strategy for a fired agent | Paused, not deleted. |
| E6 | Rebalance already on target | `nothing_to_do`, not a failure. |
| E7 | Stop not hit | `nothing_to_do`. |
| E8 | Revoke mid-flight | Next run blocked with the revoked reason. |
| E9 | Graph index for another deployment | The agent declines to read permission from it and says so. |
| E10 | No spot feed | No chart, and the screen says why. |
| E11 | Signed out | No authenticated request is fired at all. |
| E12 | Bot out of gas | Run blocked `agent_out_of_gas`; health degraded, not down. |
| E13 | Upstream down | Circuit breaker opens after 4 failures; callers fail fast. |
| E14 | Executor killed mid-run | Drains; anything unfinished is reconciled and not retried. |
| E15 | A screen throws | Contained; tab bar and kill switch survive. |
| E16 | Grid outside its range | Stops rather than chasing. |
| E17 | Grid first run | Takes a reading, places nothing. |
| E18 | Sale with no cost basis | Proceeds recorded, no fabricated gain, flagged incomplete. |
| E19 | Whole-position close | Uses the chain's exact balance, not a float round-trip. |
| E20 | Per-strategy allocation exhausted | Blocked while the account cap still has room. |
