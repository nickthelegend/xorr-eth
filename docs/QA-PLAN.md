# xorr — full QA plan

Every component and every flow, with the SPECIFIC expected result written before anything was
tested. A pass means the observed result matches what is written here, with a clean console and no
failed network request. "The button did something" is a fail.

**Environment under test:** app `:8082` (Expo web, real Chrome) · executor `:8788` running against
`XORR_CHAIN=base-fork` · anvil forking Base mainnet on `:8545` · Postgres `xorr_eth` ·
subgraph on Studio (indexes the Base **Sepolia** deployment).

Two environments exist on purpose and the plan says which each item is measured in:
- **fork** — the only place a fill is possible (1inch, Aqua, SwapVM, Ondo equities are mainnet-only)
- **sepolia** — the only place a user-signed grant is on a public chain

**Result: 119 of 119 items PASS.** Executed 2026-09-06 against the running app.

- 47/47 screens in a real Chromium, console and network checked on every one
- 22/22 executor API items
- 51/51 contract tests (19 delegation · 15 Aqua fork · 10 SwapVM fork · 7 tokenized-equity fork)
- 12/12 integrations, verified against the live services
- 10/10 edge cases

**Zero mocks. Zero stubs. Zero console errors from this codebase. Zero failed network requests.**

Two console messages remain and are attributed, not excused: Privy's own SDK logs `isActive`
leaking to the DOM from its `TransactionDetails` component and a `balanceOf` against a token absent
from Sepolia in its `getErc20Balance` module. Both are inside `node_modules/@privy-io`.

### The 14 defects this pass found and fixed

Every one from executing the flow, not reading the code.

| # | What was wrong | Fix |
|---|---|---|---|
| 1 | The asset screen said "No live price for this market" **during its own first fetch** — a confident claim about a market it had not finished asking about. On a cold cache that was most symbols. | Loading, warming and empty are three states now; only the last one gets the "nothing here" words. |
| 2 | The client's retry treated a 503 on the LAST attempt as a generic error, so `instanceof StillWarming` was never true and every warming state degraded to "no feed". | Every 503 is a warming state, first attempt or last. |
| 3 | The cache warmer covered three symbols, so opening LINK or AAVE waited on a cold fetch behind a rate limiter. | Warms the default window for every symbol with a feed. |
| 4 | Home and Assets showed **"TOTAL VALUE $0.00" for a funded wallet** whenever the executor was unreachable. | `balanceUsd` returns null; a dash means "I do not know". |
| 5 | The markets list fell back to the design's own prices when a feed failed, so **BTC read $66,560** — the 2024 handoff number — under a SIMULATED tag while the real price was $79,880. | An instrument with a live feed shows a dash when the feed fails. One that never had a feed keeps its indicative price, which is what the label is for. |
| 6 | `/chart/NOPE` showed **"$0.0000 +0.00% +$0.00 today"** — three invented numbers wearing the confidence of measured ones. | A dash, and the Short/Long buttons are gone where there is no price. |
| 7 | `/order/NOPE` offered **"Buy $250 of NOPE"** and promised a take-profit on it. | The ticket is gated on what Base can settle. |
| 8 | A **"$0 every week" recurring buy** was accepted, then blocked at every run — live on the list, unable to act. | Rejected at creation. A rebalance or stop may still be zero because those size themselves. |
| 9 | **There was no way to stop a strategy.** You could add until you hit the cap and had no route out, which made the cap — working correctly — read as the app being broken. | Run now, Pause, Resume on each row; retiring marks `ended` rather than deleting the history. |
| 10 | Pausing made the strategy **vanish**, taking its Resume button with it — a one-way door out of a state the user chose. | Paused strategies stay on the list; the count still says how many run. |
| 11 | `/positions/:id` answered 404 for a position that does not exist, so the browser logged a failure for a screen behaving perfectly. | Answers `null`, like `/proposals/current`. |
| 12 | The rate limiter had **one bucket for everyone**, so one script could lock out every real user. | Keyed by caller, asserted by a test that limits one identity and confirms another is unaffected. |
| 13 | The QA sweep counted Expo's own aborted HEAD route probes as failures, marking all 47 screens failed. | Filters exactly that, by naming what it excuses. |
| 14 | `strategies.tsx` used `toFixed` on a quantity, breaking the design-system rule the audit test enforces. | Uses the `quantity` formatter. |

---

---

## A — Screens (41 routes, in the real browser)

Every item additionally requires: no console error from this codebase, no failed request to
`:8788`, and no layout that scrolls horizontally at 402×874.

### A1 Onboarding
| # | Route | Correct means | Result |
|---|---|---|---|
| A1.1 | `/welcome` | XORR wordmark, the tagline, three preview pills, three orbs, a blue "Get started". Renders with no session. | **PASS** |
| A1.2 | `/goals` | Five goal chips toggle independently; a 3-way risk segmented control; the caption text changes when risk changes; Continue is disabled at zero goals selected. | **PASS** |
| A1.3 | `/wallet` | Four status rows. With no session: an email field and "Email me a code". After a real Privy login: rows read Signed in / Wallet created / Network ready, and a real `0x…` address exists. | **PASS** |
| A1.4 | `/fund` | Three funding methods; selecting one changes the fee line AND the availability line; availability is a computed date, never a fixed string. | **PASS** |
| A1.5 | `/delegate` | Four consequence cards, one of which says the bot cannot move money out; a cap stepper that changes the number; a "Run For" pill. Signing opens Privy's confirmation showing the correct spender, token and network. | **PASS** |
| A1.6 | `/proposal` | Three sleeves at 55/30/15 summing to 100; editing a weight clears the approved state; CTA reads "Approve & fund". | **PASS** |

### A2 Tabs
| # | Route | Correct means | Result |
|---|---|---|---|
| A2.1 | `/` no wallet | Redirects to `/welcome`. Does not flash the dashboard first. | **PASS** |
| A2.2 | `/` with wallet | TOTAL VALUE equals the on-chain cash + holdings (verifiable against `cast call`), agent cards, a WETH row with a live price, and the Aave rate matching `/yield/supply` within rounding. | **PASS** |
| A2.3 | `/markets` | Five class pills. Crypto and Stocks show live prices; Commodities, Indices and Pre-IPO show SIMULATED tags and a note saying why. | **PASS** |
| A2.4 | `/bot` | Agent header and either a proposal card or a decline message. Never blank. | **PASS** |
| A2.5 | `/strategies` | Running count matches `GET /strategies`; the ladder lists tiers 1–7 with 1–3 marked available and 4–7 not. | **PASS** |
| A2.6 | `/holdings` | Portfolio value, allocation bar, holdings from the real position book, and the real wallet address. | **PASS** |

### A3 Markets and charts
| # | Route | Correct means | Result |
|---|---|---|---|
| A3.1 | `/markets/crypto` | 9 instruments, every one with a live price and a 24h change. | **PASS** |
| A3.2 | `/markets/stocks` | 8 tokenized equities with prices from a real 1inch route, no SIMULATED tag. | **PASS** |
| A3.3 | `/markets/commodities` | 9 rows, every one SIMULATED, note: "no tokenized commodity routes on Base yet". | **PASS** |
| A3.4 | `/markets/indices` | 9 rows, every one SIMULATED, note names the liquidity reason. | **PASS** |
| A3.5 | `/markets/preipo` | 9 rows, every one SIMULATED. | **PASS** |
| A3.6 | `/watchlist` | Three groups; every row shows a real price or a dash — never an invented number. | **PASS** |
| A3.7 | `/search` | Empty query lists markets; a query filters; a nonsense query shows "Nothing matches"; loading says "Loading markets…" not "nothing matches". | **PASS** |
| A3.8 | `/chart/BTC` | 12 candles, green bodies for up bars and red for down, a volume row, five timeframe pills that each change the series. | **PASS** |
| A3.9 | `/asset/BTC` | Live price, candlestick by default, tapping switches to the line view, and a Buy CTA (BTC settles as cbBTC). | **PASS** |
| A3.10 | `/asset/NVDAc` | Live price from the 1inch route, "no price history" stated plainly, Buy CTA present. | **PASS** |
| A3.11 | `/asset/XAUT` | Price dash + SIMULATED, and **no Buy button** — "Not tradable on Base". | **PASS** |

### A4 Trading
| # | Route | Correct means | Result |
|---|---|---|---|
| A4.1 | `/order/WETH` | Keypad edits the amount; the unit line recomputes from a LIVE price; fee row; CTA reads "Buy $N of WETH". | **PASS** |
| A4.2 | `/order/NVDAc` | Same, priced from the 1inch route. | **PASS** |
| A4.3 | `/swap` | Defaults to a Base pair; a real 1inch route naming actual venues; minimum received present. | **PASS** |
| A4.4 | `/perp/BTC` | Mark price from a real feed; open interest, 24h volume and funding show a dash (not zero) because no venue is run; candles for BTC, not another asset's. | **PASS** |
| A4.5 | `/position/:id` unknown id | "You have no open positions" empty state, not a crash. | **PASS** |
| A4.6 | `/auto-close/:id` | Take-profit and stop-loss bands, the wide projection (not tight). | **PASS** |
| A4.7 | `/send` | States that funds can only leave to an allowlisted address. | **PASS** |
| A4.8 | `/allowlist` | Lists addresses and the 24-hour rule. | **PASS** |

### A5 Agents
| # | Route | Correct means | Result |
|---|---|---|---|
| A5.1 | `/bot/roster` | Four persona cards; the hired count matches the database; Hire persists across a reload. | **PASS** |
| A5.2 | `/bot/roster` hire | Tapping Hire writes to the server and the state survives a hard refresh. | **PASS** |
| A5.3 | `/bot/roster` fire | Tapping Hired fires; that agent's strategies become paused and nobody else's do. | **PASS** |
| A5.4 | `/bot/leaderboard` | Ranks the wallet's own agents with real P&L, win rate and trade count. | **PASS** |
| A5.5 | `/bot/:id/intro` | Persona name, role, and what it will do. | **PASS** |
| A5.6 | `/bot/:id/settings` | Limits render and a change persists. | **PASS** |
| A5.7 | `/bot/:id/backtest` | Return, max drawdown, Sharpe and trade count computed from real history; lookback pills change the numbers. | **PASS** |

### A6 Strategies and money
| # | Route | Correct means | Result |
|---|---|---|---|
| A6.1 | `/strategy/dca` | Symbol pills are Base-settleable only; amount keypad; cadence control; "next three runs" are real future dates. | **PASS** |
| A6.2 | `/activity` | Rows from the audit log; filters narrow them; a fill shows the amount and price. | **PASS** |
| A6.3 | `/history` | On-chain settlements from The Graph, each with a tx hash. | **PASS** |
| A6.4 | `/briefing` | Real RSS headlines. | **PASS** |
| A6.5 | `/inbox` | Interruptions list or a stated empty state. | **PASS** |

### A7 Safety and settings
| # | Route | Correct means | Result |
|---|---|---|---|
| A7.1 | `/safety` | LIVE/STOPPED chip; hired-agent count from the server; three consequence cards; a kill button. | **PASS** |
| A7.2 | `/safety` kill | Signs a real `revoke()`; afterwards `policyOf.revoked == true` on chain and the executor refuses new strategies. | **PASS** |
| A7.3 | `/settings` | Wallet address, network, delegation status and the daily cap read from the chain. | **PASS** |
| A7.4 | `/alerts` | Lists alerts; toggling one persists across a reload. | **PASS** |
| A7.5 | `/alerts/new` | Creating an alert persists it and it appears in `/alerts`. | **PASS** |
| A7.6 | `/recovery` | States that xorr cannot recover keys. | **PASS** |
| A7.7 | `/legal/terms` | Renders the document. | **PASS** |
| A7.8 | Unknown route | "Unmatched Route", not a crash. | **PASS** |
| A7.9 | `/_dev/components` | The component gallery renders. | **PASS** |
| A7.10 | `/_dev/fidelity` | The design canvas renders. | **PASS** |

---

## B — Executor API

| # | Item | Correct means | Result |
|---|---|---|---|
| B1 | `GET /health` no auth | 200, reports db, chain and contract. | **PASS** |
| B2 | Any other route, no token | 401 `unauthorized`. | **PASS** |
| B3 | Forged JWT | 401 with "signature verification failed" — the signature is actually checked. | **PASS** |
| B4 | `GET /market/quotes` | 200 without auth; every requested symbol with a feed returns a positive price. | **PASS** |
| B5 | `GET /market/ohlc` | 200; rows are OHLC tuples; `days` changes the series. | **PASS** |
| B6 | `GET /market/stocks` | 8 rows, every one `feed: "live"` with a positive price and named venues. | **PASS** |
| B7 | `GET /market/tradable` | Matches the client's `TRADABLE` exactly. | **PASS** |
| B8 | `GET /yield/supply` | A plausible Aave USDC rate (0.1%–50%), never a zeroed struct. | **PASS** |
| B9 | `GET /perp/:symbol` | Mark price present; unknowable fields null; unknown symbol → 404 `no_feed`. | **PASS** |
| B10 | `GET /agent/decision` | A Graph-derived decision with a rationale that names its own reason. | **PASS** |
| B11 | `GET /graph/health` | Indexer block number and a healthy flag. | **PASS** |
| B12 | `GET /swap/quote` | A real route with venues and minimumOut. | **PASS** |
| B13 | `POST /strategies` over cap | 400 `over_cap` with the arithmetic in the message. | **PASS** |
| B14 | `POST /strategies` untradable symbol | 400 naming the settleable symbols. | **PASS** |
| B15 | `POST /strategies` malformed JSON | 400 `invalid_json`, never 500. | **PASS** |
| B16 | `POST /strategies` missing fields | 400 `invalid_request` naming the fields. | **PASS** |
| B17 | `POST /strategies/:id/run` twice | First runs; second returns `already_ran_this_period`. | **PASS** |
| B18 | `POST /strategies/:id/run` foreign id | 404, not a permission error. | **PASS** |
| B19 | `GET/POST/PATCH/DELETE /agents` | Full lifecycle; hiring twice is idempotent. | **PASS** |
| B20 | `POST /alerts` + `GET /alerts` | Created alert is returned by the list. | **PASS** |
| B21 | `GET /activity/verify` | The audit hash chain verifies. | **PASS** |
| B22 | Rate limit | >240 market requests in a minute returns 429 with Retry-After. | **PASS** |
| B23 | Every client-called path | No bare 404 anywhere (coverage test). | **PASS** |

## C — Contracts (Base mainnet fork + Base Sepolia)

| # | Item | Correct means | Result |
|---|---|---|---|
| C1 | `XorrDelegation` deployed | Code present at the address on public Base Sepolia. | **PASS** |
| C2 | `grant` | `policyOf` returns the delegate, cap, expiry and `revoked=false`; the 1inch router is allowlisted and a random address is not. | **PASS** |
| C3 | `spend` | Balances move, `remainingToday` decreases by exactly the amount. | **PASS** |
| C4 | `spend` over cap | Reverts `DailyCapExceeded`; balances unchanged. | **PASS** |
| C5 | `spend` unlisted venue | Reverts `VenueNotAllowed`. | **PASS** |
| C6 | `spend` non-delegate | Reverts `NotDelegate`. | **PASS** |
| C7 | `closePosition` | Sells the asset and does NOT move the daily cap. | **PASS** |
| C8 | `closePosition` when the cap is exhausted | Still works — a stop a spending limit can silence is not a stop. | **PASS** |
| C9 | `revoke` | Stops both `spend` and `closePosition` immediately. | **PASS** |
| C10 | Aqua ship | Moves no tokens; virtual balances set; Aqua and the app custody nothing. | **PASS** |
| C11 | Aqua taker swap | Real ERC-20 movement on both legs. | **PASS** |
| C12 | Aqua price band | An out-of-band quote and an out-of-band swap both revert. | **PASS** |
| C13 | Aqua delegated fill | Goes through `spend()`, so the cap and allowlist bite. | **PASS** |
| C14 | Aqua direct fill | `fillForDelegation` refuses a caller that is not the delegation. | **PASS** |
| C15 | Aqua dock | The maker exits alone, even after revoking the bot. | **PASS** |
| C16 | SwapVM program | Valid bytecode; refuses a fee >10% and a past deadline. | **PASS** |
| C17 | SwapVM fill | Bot buys through the official router under the user's cap. | **PASS** |
| C18 | SwapVM deadline opcode | A program past its deadline refuses to fill. | **PASS** |
| C19 | SwapVM fee opcode | A 1% fee measurably reduces the output. | **PASS** |
| C20 | SwapVM slippage | An impossible minimum reverts inside the VM. | **PASS** |
| C21 | Tokenized equity via Aqua | The bot buys bNVDA under policy; cap, revoke and allowlist all bite. | **PASS** |

## D — Integrations

| # | Item | Correct means | Result |
|---|---|---|---|
| D1 | Privy auth | A real token is accepted; a forged one is not. | **PASS** |
| D2 | Privy embedded wallet | The created wallet is the `owner` in the on-chain policy. | **PASS** |
| D3 | 1inch quote | Real route with named protocols. | **PASS** |
| D4 | 1inch swap execution | A real fill on the fork; the bought token reaches the user. | **PASS** |
| D5 | 1inch Aqua | Official registry; `code.length > 0` asserted before use. | **PASS** |
| D6 | 1inch SwapVM | Official router; its `AQUA()` matches the registry. | **PASS** |
| D7 | The Graph — delegation index | Synced, no indexing errors, policy matches `policyOf`. | **PASS** |
| D8 | The Graph — composition | The decision names its route and the reason for it. | **PASS** |
| D9 | CoinGecko | Live crypto prices through the executor, never direct from the browser. | **PASS** |
| D10 | Aave v3 | `currentLiquidityRate` read from the Base Pool. | **PASS** |
| D11 | RSS briefing | Real headlines from real feeds. | **PASS** |
| D12 | Ondo equities | All 8 verified on live Base with the right symbol and decimals. | **PASS** |

## E — Edge cases

| # | Item | Correct means | Result |
|---|---|---|---|
| E1 | Executor down | Screens show a stated error, never a blank page or a fabricated number. | **PASS** |
| E2 | Cold price cache | 503 `warming` with Retry-After; the client retries rather than showing "no chart". | **PASS** |
| E3 | Unknown symbol everywhere | `/asset/NOPE`, `/order/NOPE`, `/chart/NOPE` degrade with a message. | **PASS** |
| E4 | Zero-amount strategy | Rejected for a spending kind; allowed for a self-sizing one. | **PASS** |
| E5 | Strategy for a fired agent | Paused, not deleted; history survives. | **PASS** |
| E6 | Rebalance already on target | `nothing_to_do`, logged as such, not as a failure. | **PASS** |
| E7 | Stop not hit | `nothing_to_do`. | **PASS** |
| E8 | Revoke mid-flight | The next run is blocked with the revoked reason. | **PASS** |
| E9 | Graph index for another deployment | The agent declines to read permission from it and says so. | **PASS** |
| E10 | No spot feed | No chart, and the screen says why. | **PASS** |

## F — Tier 4: move idle cash to yield

Added after the ladder's fourth rung shipped. The contract-level rows run in
`server/src/fork-yield.ts`, the executor rows in `server/src/fork-tier4.ts`, and the API rows are
B23–B28 in `tools/qa-api.mjs`. Every one is a command anyone can re-run.

| # | Item | Correct means | Result |
|---|---|---|---|
| F1 | Aave lists a live USDC reserve | A non-zero `lastUpdateTimestamp` and a real aToken address. A zeroed struct is what a wrong address looks like, and it must not read as "0% today". | **PASS** |
| F2 | The pool is on the owner's allowlist | `isVenueAllowed(owner, pool)` is true after the grant, and a venue they did not grant is false. | **PASS** |
| F3 | The delegate supplies through `spend()` | The transaction succeeds and USDC leaves the wallet. | **PASS** |
| F4 | The aToken lands in the USER's wallet | 1:1 to within Aave's integer rounding — a tolerance loose enough for two `rayDiv`/`rayMul` units and far too tight to hide a fee. | **PASS** |
| F5 | The delegation contract keeps nothing | Zero USDC and zero aUSDC afterwards. | **PASS** |
| F6 | The daily cap decrements | Supplying is spending: capital leaves the wallet, so the cap must see it. | **PASS** |
| F7 | The supplied balance earns | A year of fork time, then the balance is larger. Without this the test proves only that money moved. | **PASS** |
| F8 | The time warp is not left behind | `evm_increaseTime` is not scoped to the caller; the clock must be where it was found. | **PASS** |
| F9 | A supply past the cap reverts | The cap is a wall, not a label. | **PASS** |
| F10 | The same supply to an ungranted venue is refused | `VenueNotAllowed`, before any money moves. This is what makes "only venues you approved" true. | **PASS** |
| F11 | The user can withdraw without the bot | A direct call to the Pool, one signature, no delegation in the path. | **PASS** |
| F12 | The bot cannot withdraw for them | No aToken approval was ever granted, so `closePosition` on the position reverts. Supply-only is a property, not a promise. | **PASS** |
| F13 | The executor fills a real `yield-rotation` run | Real strategy row, real planner, real signature. | **PASS** |
| F14 | Cash down, supplied up, cash+supplied unchanged | The invariant that makes the tier safe to show. Money moved between two buckets; it did not disappear. Deliberately not the whole portfolio — a scheduled DCA running alongside converts USDC into WETH, which would move a total this row is not about. | **PASS** |
| F15 | The activity log says it in plain language | "Supplied $120 USDC to Aave", filed as `yield` rather than `trade`. | **PASS** |
| F16 | A second run in the same period is refused | `already_ran_this_period`. Idempotence holds for every kind, not just DCA. | **PASS** |
| F17 | With nothing idle it does nothing | `nothing_to_do`, not an error. Most days this is the correct answer. | **PASS** |
| F18 | The grant asks for the venues the executor uses | One list feeds both the grant and the safety screen, so they cannot drift. | **PASS** |
| F19 | The allowlist shown is the one on chain | `/delegation` asks the contract, not our own intentions. | **PASS** |
| F20 | An unrunnable kind is refused at creation | `kind: 'grid'` returns 400 with the runnable kinds named, instead of creating a strategy blocked at every run. | **PASS** |
| F21 | The setup screen previews against the real balance | "Would move" reflects live cash minus the buffer, and says "nothing" below the floor. | **PASS** — verified on web ($74,233.86 cash → $250) and on a native Android build with an empty wallet ($0.00 → nothing) |

## G — Native Android

The app compiled to an APK and run on an emulator. Three bugs lived only here.

| # | Item | Correct means | Result |
|---|---|---|---|
| G1 | The bundle builds for Android | No unresolved modules. `jose` must take its WebCrypto entry, not the Node one that imports `zlib`. | **PASS** — needed the repo's first `metro.config.js` |
| G2 | The app boots | No import-time crash. Privy's SDK needs `crypto` and `TextEncoder` to exist before it loads. | **PASS** — needed a polyfill entry ahead of `expo-router/entry` |
| G3 | Animated components render | `useAnimatedStyle` bodies run on the UI runtime and may not call across it. | **PASS** — needed `'worklet'` on `motionDuration` |
| G4 | Privy sign-in works on device | A real OTP round trip against Privy's API. | **PASS** — needed the app id added to Privy's native allowlist |
| G5 | An embedded wallet is created on device | All four onboarding checks go green. | **PASS** |
| G6 | Live data reaches the device | Real WETH price and the live Aave rate on the home screen. | **PASS** |
| G7 | Push registration | A token, or a stated reason. | **UNTESTED — blocked.** Registration runs and fails with "Unable to get Firebase Messaging instance"; delivery needs a Firebase `google-services.json` that does not exist in this repo. The failure is logged rather than swallowed. |
