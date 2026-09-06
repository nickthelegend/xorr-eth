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

---

## A — Screens (41 routes, in the real browser)

Every item additionally requires: no console error from this codebase, no failed request to
`:8788`, and no layout that scrolls horizontally at 402×874.

### A1 Onboarding
| # | Route | Correct means |
|---|---|---|
| A1.1 | `/welcome` | XORR wordmark, the tagline, three preview pills, three orbs, a blue "Get started". Renders with no session. |
| A1.2 | `/goals` | Five goal chips toggle independently; a 3-way risk segmented control; the caption text changes when risk changes; Continue is disabled at zero goals selected. |
| A1.3 | `/wallet` | Four status rows. With no session: an email field and "Email me a code". After a real Privy login: rows read Signed in / Wallet created / Network ready, and a real `0x…` address exists. |
| A1.4 | `/fund` | Three funding methods; selecting one changes the fee line AND the availability line; availability is a computed date, never a fixed string. |
| A1.5 | `/delegate` | Four consequence cards, one of which says the bot cannot move money out; a cap stepper that changes the number; a "Run For" pill. Signing opens Privy's confirmation showing the correct spender, token and network. |
| A1.6 | `/proposal` | Three sleeves at 55/30/15 summing to 100; editing a weight clears the approved state; CTA reads "Approve & fund". |

### A2 Tabs
| # | Route | Correct means |
|---|---|---|
| A2.1 | `/` no wallet | Redirects to `/welcome`. Does not flash the dashboard first. |
| A2.2 | `/` with wallet | TOTAL VALUE equals the on-chain cash + holdings (verifiable against `cast call`), agent cards, a WETH row with a live price, and the Aave rate matching `/yield/supply` within rounding. |
| A2.3 | `/markets` | Five class pills. Crypto and Stocks show live prices; Commodities, Indices and Pre-IPO show SIMULATED tags and a note saying why. |
| A2.4 | `/bot` | Agent header and either a proposal card or a decline message. Never blank. |
| A2.5 | `/strategies` | Running count matches `GET /strategies`; the ladder lists tiers 1–7 with 1–3 marked available and 4–7 not. |
| A2.6 | `/holdings` | Portfolio value, allocation bar, holdings from the real position book, and the real wallet address. |

### A3 Markets and charts
| # | Route | Correct means |
|---|---|---|
| A3.1 | `/markets/crypto` | 9 instruments, every one with a live price and a 24h change. |
| A3.2 | `/markets/stocks` | 8 tokenized equities with prices from a real 1inch route, no SIMULATED tag. |
| A3.3 | `/markets/commodities` | 9 rows, every one SIMULATED, note: "no tokenized commodity routes on Base yet". |
| A3.4 | `/markets/indices` | 9 rows, every one SIMULATED, note names the liquidity reason. |
| A3.5 | `/markets/preipo` | 9 rows, every one SIMULATED. |
| A3.6 | `/watchlist` | Three groups; every row shows a real price or a dash — never an invented number. |
| A3.7 | `/search` | Empty query lists markets; a query filters; a nonsense query shows "Nothing matches"; loading says "Loading markets…" not "nothing matches". |
| A3.8 | `/chart/BTC` | 12 candles, green bodies for up bars and red for down, a volume row, five timeframe pills that each change the series. |
| A3.9 | `/asset/BTC` | Live price, candlestick by default, tapping switches to the line view, and a Buy CTA (BTC settles as cbBTC). |
| A3.10 | `/asset/NVDAc` | Live price from the 1inch route, "no price history" stated plainly, Buy CTA present. |
| A3.11 | `/asset/XAUT` | Price dash + SIMULATED, and **no Buy button** — "Not tradable on Base". |

### A4 Trading
| # | Route | Correct means |
|---|---|---|
| A4.1 | `/order/WETH` | Keypad edits the amount; the unit line recomputes from a LIVE price; fee row; CTA reads "Buy $N of WETH". |
| A4.2 | `/order/NVDAc` | Same, priced from the 1inch route. |
| A4.3 | `/swap` | Defaults to a Base pair; a real 1inch route naming actual venues; minimum received present. |
| A4.4 | `/perp/BTC` | Mark price from a real feed; open interest, 24h volume and funding show a dash (not zero) because no venue is run; candles for BTC, not another asset's. |
| A4.5 | `/position/:id` unknown id | "You have no open positions" empty state, not a crash. |
| A4.6 | `/auto-close/:id` | Take-profit and stop-loss bands, the wide projection (not tight). |
| A4.7 | `/send` | States that funds can only leave to an allowlisted address. |
| A4.8 | `/allowlist` | Lists addresses and the 24-hour rule. |

### A5 Agents
| # | Route | Correct means |
|---|---|---|
| A5.1 | `/bot/roster` | Four persona cards; the hired count matches the database; Hire persists across a reload. |
| A5.2 | `/bot/roster` hire | Tapping Hire writes to the server and the state survives a hard refresh. |
| A5.3 | `/bot/roster` fire | Tapping Hired fires; that agent's strategies become paused and nobody else's do. |
| A5.4 | `/bot/leaderboard` | Ranks the wallet's own agents with real P&L, win rate and trade count. |
| A5.5 | `/bot/:id/intro` | Persona name, role, and what it will do. |
| A5.6 | `/bot/:id/settings` | Limits render and a change persists. |
| A5.7 | `/bot/:id/backtest` | Return, max drawdown, Sharpe and trade count computed from real history; lookback pills change the numbers. |

### A6 Strategies and money
| # | Route | Correct means |
|---|---|---|
| A6.1 | `/strategy/dca` | Symbol pills are Base-settleable only; amount keypad; cadence control; "next three runs" are real future dates. |
| A6.2 | `/activity` | Rows from the audit log; filters narrow them; a fill shows the amount and price. |
| A6.3 | `/history` | On-chain settlements from The Graph, each with a tx hash. |
| A6.4 | `/briefing` | Real RSS headlines. |
| A6.5 | `/inbox` | Interruptions list or a stated empty state. |

### A7 Safety and settings
| # | Route | Correct means |
|---|---|---|
| A7.1 | `/safety` | LIVE/STOPPED chip; hired-agent count from the server; three consequence cards; a kill button. |
| A7.2 | `/safety` kill | Signs a real `revoke()`; afterwards `policyOf.revoked == true` on chain and the executor refuses new strategies. |
| A7.3 | `/settings` | Wallet address, network, delegation status and the daily cap read from the chain. |
| A7.4 | `/alerts` | Lists alerts; toggling one persists across a reload. |
| A7.5 | `/alerts/new` | Creating an alert persists it and it appears in `/alerts`. |
| A7.6 | `/recovery` | States that xorr cannot recover keys. |
| A7.7 | `/legal/terms` | Renders the document. |
| A7.8 | Unknown route | "Unmatched Route", not a crash. |
| A7.9 | `/_dev/components` | The component gallery renders. |
| A7.10 | `/_dev/fidelity` | The design canvas renders. |

---

## B — Executor API

| # | Item | Correct means |
|---|---|---|
| B1 | `GET /health` no auth | 200, reports db, chain and contract. |
| B2 | Any other route, no token | 401 `unauthorized`. |
| B3 | Forged JWT | 401 with "signature verification failed" — the signature is actually checked. |
| B4 | `GET /market/quotes` | 200 without auth; every requested symbol with a feed returns a positive price. |
| B5 | `GET /market/ohlc` | 200; rows are OHLC tuples; `days` changes the series. |
| B6 | `GET /market/stocks` | 8 rows, every one `feed: "live"` with a positive price and named venues. |
| B7 | `GET /market/tradable` | Matches the client's `TRADABLE` exactly. |
| B8 | `GET /yield/supply` | A plausible Aave USDC rate (0.1%–50%), never a zeroed struct. |
| B9 | `GET /perp/:symbol` | Mark price present; unknowable fields null; unknown symbol → 404 `no_feed`. |
| B10 | `GET /agent/decision` | A Graph-derived decision with a rationale that names its own reason. |
| B11 | `GET /graph/health` | Indexer block number and a healthy flag. |
| B12 | `GET /swap/quote` | A real route with venues and minimumOut. |
| B13 | `POST /strategies` over cap | 400 `over_cap` with the arithmetic in the message. |
| B14 | `POST /strategies` untradable symbol | 400 naming the settleable symbols. |
| B15 | `POST /strategies` malformed JSON | 400 `invalid_json`, never 500. |
| B16 | `POST /strategies` missing fields | 400 `invalid_request` naming the fields. |
| B17 | `POST /strategies/:id/run` twice | First runs; second returns `already_ran_this_period`. |
| B18 | `POST /strategies/:id/run` foreign id | 404, not a permission error. |
| B19 | `GET/POST/PATCH/DELETE /agents` | Full lifecycle; hiring twice is idempotent. |
| B20 | `POST /alerts` + `GET /alerts` | Created alert is returned by the list. |
| B21 | `GET /activity/verify` | The audit hash chain verifies. |
| B22 | Rate limit | >240 market requests in a minute returns 429 with Retry-After. |
| B23 | Every client-called path | No bare 404 anywhere (coverage test). |

## C — Contracts (Base mainnet fork + Base Sepolia)

| # | Item | Correct means |
|---|---|---|
| C1 | `XorrDelegation` deployed | Code present at the address on public Base Sepolia. |
| C2 | `grant` | `policyOf` returns the delegate, cap, expiry and `revoked=false`; the 1inch router is allowlisted and a random address is not. |
| C3 | `spend` | Balances move, `remainingToday` decreases by exactly the amount. |
| C4 | `spend` over cap | Reverts `DailyCapExceeded`; balances unchanged. |
| C5 | `spend` unlisted venue | Reverts `VenueNotAllowed`. |
| C6 | `spend` non-delegate | Reverts `NotDelegate`. |
| C7 | `closePosition` | Sells the asset and does NOT move the daily cap. |
| C8 | `closePosition` when the cap is exhausted | Still works — a stop a spending limit can silence is not a stop. |
| C9 | `revoke` | Stops both `spend` and `closePosition` immediately. |
| C10 | Aqua ship | Moves no tokens; virtual balances set; Aqua and the app custody nothing. |
| C11 | Aqua taker swap | Real ERC-20 movement on both legs. |
| C12 | Aqua price band | An out-of-band quote and an out-of-band swap both revert. |
| C13 | Aqua delegated fill | Goes through `spend()`, so the cap and allowlist bite. |
| C14 | Aqua direct fill | `fillForDelegation` refuses a caller that is not the delegation. |
| C15 | Aqua dock | The maker exits alone, even after revoking the bot. |
| C16 | SwapVM program | Valid bytecode; refuses a fee >10% and a past deadline. |
| C17 | SwapVM fill | Bot buys through the official router under the user's cap. |
| C18 | SwapVM deadline opcode | A program past its deadline refuses to fill. |
| C19 | SwapVM fee opcode | A 1% fee measurably reduces the output. |
| C20 | SwapVM slippage | An impossible minimum reverts inside the VM. |
| C21 | Tokenized equity via Aqua | The bot buys bNVDA under policy; cap, revoke and allowlist all bite. |

## D — Integrations

| # | Item | Correct means |
|---|---|---|
| D1 | Privy auth | A real token is accepted; a forged one is not. |
| D2 | Privy embedded wallet | The created wallet is the `owner` in the on-chain policy. |
| D3 | 1inch quote | Real route with named protocols. |
| D4 | 1inch swap execution | A real fill on the fork; the bought token reaches the user. |
| D5 | 1inch Aqua | Official registry; `code.length > 0` asserted before use. |
| D6 | 1inch SwapVM | Official router; its `AQUA()` matches the registry. |
| D7 | The Graph — delegation index | Synced, no indexing errors, policy matches `policyOf`. |
| D8 | The Graph — composition | The decision names its route and the reason for it. |
| D9 | CoinGecko | Live crypto prices through the executor, never direct from the browser. |
| D10 | Aave v3 | `currentLiquidityRate` read from the Base Pool. |
| D11 | RSS briefing | Real headlines from real feeds. |
| D12 | Ondo equities | All 8 verified on live Base with the right symbol and decimals. |

## E — Edge cases

| # | Item | Correct means |
|---|---|---|
| E1 | Executor down | Screens show a stated error, never a blank page or a fabricated number. |
| E2 | Cold price cache | 503 `warming` with Retry-After; the client retries rather than showing "no chart". |
| E3 | Unknown symbol everywhere | `/asset/NOPE`, `/order/NOPE`, `/chart/NOPE` degrade with a message. |
| E4 | Zero-amount strategy | Rejected for a spending kind; allowed for a self-sizing one. |
| E5 | Strategy for a fired agent | Paused, not deleted; history survives. |
| E6 | Rebalance already on target | `nothing_to_do`, logged as such, not as a failure. |
| E7 | Stop not hit | `nothing_to_do`. |
| E8 | Revoke mid-flight | The next run is blocked with the revoked reason. |
| E9 | Graph index for another deployment | The agent declines to read permission from it and says so. |
| E10 | No spot feed | No chart, and the screen says why. |
