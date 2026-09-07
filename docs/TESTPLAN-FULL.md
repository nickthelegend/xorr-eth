# Full test plan — every component, every flow

Written **before** testing, as the checklist everything is measured against. A PASS means the
observed result matches the stated expectation exactly, with a clean console and no failed request.
"The button did something" is not a pass.

**Browser used:** the in-app Chromium pane driving the real running app at `http://localhost:8082`
against the deployed executor `executor-production-1659.up.railway.app` (Base Sepolia) and
`executor-fork-production.up.railway.app` (Base mainnet fork). *Claude in Chrome reported no
connected browser (`list_connected_browsers` → `[]`), so the extension surface was unavailable;
this is a real browser driving the real product either way, and the substitution is stated rather
than hidden.*

**Standing rule for every item:** console must contain no error originating in this codebase, and
no request may fail unexpectedly. Expo's own `ws://localhost:8082/hot` dev-socket noise and Privy's
analytics 401s are environment, not product, and are called out where they appear.

---

## A. Screens — 47 routes

Each must render its real state, with no hardcoded demo data, no stuck spinner, and a next action
where the state is empty.

| # | Route | Correct means |
|---|---|---|
| A1 | `/welcome` | Wordmark + value proposition; a control that starts onboarding |
| A2 | `/goals` | Goal choices selectable; selection persists to the next step |
| A3 | `/wallet` | Real Privy embedded wallet address, or a sign-in prompt if signed out |
| A4 | `/fund` | Real wallet address in full, a scannable QR encoding `ethereum:<addr>@<chainId>`, and the honest "no custody" note |
| A5 | `/delegate` | The four limits, and a CTA that states exactly how many signatures it will ask for |
| A6 | `/proposal` | Real sleeve weights summing to 100; approve disabled until they do |
| A7 | `/` (home) | Real portfolio value from chain, catch-up card, no invented balance |
| A8 | `/markets` | 5 asset-class tabs; live prices; a sparkline per row that has history |
| A9 | `/markets/crypto` | 9 crypto markets with live price + 24h change |
| A10 | `/markets/stocks` | Tokenized equities with a price derived from a real 1inch route |
| A11 | `/markets/commodities` | Priced where a feed exists; SIMULATED tag where not |
| A12 | `/markets/indices` | As above |
| A13 | `/markets/preipo` | As above |
| A14 | `/watchlist` | The conviction list with live prices (not em-dashes once warm) |
| A15 | `/search` | Resolves to a list of real instruments with live prices |
| A16 | `/asset/BTC` | Live spot, a real candle series, and a change label naming its own window |
| A17 | `/asset/NVDAc` | Real 1inch-derived price; "no price history" stated, not faked |
| A18 | `/chart/BTC` | Live price, real candles, timeframe pills that change the series |
| A19 | `/order/WETH` | Live quote, real unit conversion, refusal when over balance |
| A20 | `/order/NVDAc` | Same, for an equity — must not 502 |
| A21 | `/swap` | Real 1inch route, minimum-out, price impact; the venue's own reason on failure |
| A22 | `/perp/BTC` | Real mark; leverage maths; liquidation derived, not typed |
| A23 | `/position/:id` | Real position; "no longer open" for an unknown id |
| A24 | `/auto-close/:id` | TP/SL/trailing controls over the position's own market; "no longer open" for an unknown id |
| A25 | `/bot` | Hired agents with real counts |
| A26 | `/bot/roster` | 4 personas, hire/fire real, performance disclaimer present |
| A27 | `/bot/leaderboard` | Ranked by real P&L; zeroes shown as zeroes |
| A28 | `/bot/momentum-scout/intro` | Persona copy + "All agents can make mistakes" |
| A29 | `/bot/momentum-scout/settings` | Limits reflect the on-chain policy |
| A30 | `/bot/momentum-scout/backtest` | Real OHLC-derived result that CHANGES with the range pill |
| A31 | `/strategies` | Live strategies with real state |
| A32 | `/strategy/dca` | Tradable symbols only; next three run dates real |
| A33 | `/strategy/grid` | Live price, range suggestion, rung maths |
| A34 | `/strategy/yield` | Live Aave APY, not a constant |
| A35 | `/yield` | Real supplied balance, or a stated reason there is no pool |
| A36 | `/flatten` | Real holdings preview and what it would sell |
| A37 | `/judge` | Live `/verify` results, each with observed value and method |
| A38 | `/holdings` | Real portfolio value, allocation, connected chain |
| A39 | `/activity` | Real audit entries with explorer links |
| A40 | `/history` | Read from The Graph; honest empty state |
| A41 | `/briefing` | Real news with per-agent takes |
| A42 | `/inbox` | Real notifications |
| A43 | `/safety` | LIVE/STOPPED/Disconnected, both parties, Privy policy card, approvals card, expiry warning when due |
| A44 | `/settings` | Real preferences that persist server-side |
| A45 | `/alerts` | Real alerts with armed state |
| A46 | `/alerts/new` | Only evaluable alert types offered |
| A47 | `/allowlist` | Real entries, cooling-off state, address validation |
| A48 | `/send` | User-signed withdrawal to an allowlisted address only |
| A49 | `/recovery` | Honest description of where the key is |
| A50 | `/legal/terms` | Real terms text |
| A51 | `/_dev/ui`, `/_dev/ui-edge`, `/_dev/fidelity`, `/_dev/boom` | Dev surfaces render; `boom` demonstrates the error boundary |

## B. API — 78 endpoints

Grouped. Each must return the stated shape with the stated status, and never invented data.

| # | Endpoints | Correct means |
|---|---|---|
| B1 | `/health`, `/metrics` | `ok:true` with per-dependency status (postgres, rpc, delegation) |
| B2 | `/verify` | 16+ checks, each `pass`/`fail`/`skip` with an `observed` string and a `how` |
| B3 | `/wallet`, `/wallet/create`, `/wallet/connect`, `/wallet/balance` | Scoped to the Privy user; balance read from chain |
| B4 | `/delegation`, `/delegation/params`, `/delegation/record`, `/delegation/revoke` | Policy read from chain; `delegateIsCurrent` present |
| B5 | `/approvals` | Real `allowance()` per token, raw + display + `unlimited`/`none` |
| B6 | `/privy/policy`, `/privy/policy/prove` | Policy read from Privy; prove returns `proven:true` |
| B7 | `/market/quotes`, `/ohlc`, `/sparklines`, `/symbols`, `/tradable`, `/stocks`, `/crosscheck` | Live upstream data; 503 `warming` while cold, never a fabricated price |
| B8 | `/price/:symbol`, `/perp/:symbol` | Real feed or an explicit failure |
| B9 | `/positions`, `/positions/:id`, `/positions/close` | Real positions; close awaits the receipt |
| B10 | `/strategies` (GET/POST/PATCH/DELETE), `/strategies/:id/run`, `/strategies/backtest` | Real persistence; run returns filled/skipped/blocked with a reason |
| B11 | `/agents/leaderboard`, `/agents/:id/backtest`, `/proposals*`, `/bot/say` | Real agent data; backtest varies by lookback |
| B12 | `/alerts` (GET/POST/DELETE), `/alerts/evaluate` | Real persistence and evaluation |
| B13 | `/activity`, `/activity/export`, `/activity/verify` | Real audit trail; verify reports `kind` on a break |
| B14 | `/pnl/realised`, `/pnl/disposals.csv` | Real realised P&L |
| B15 | `/graph/health`, `/graph/activity`, `/agent/decision` | Live subgraph reads |
| B16 | `/yield/position`, `/yield/supply`, `/yield/withdraw-calldata` | Real Aave reads |
| B17 | `/panic/preview`, `/panic/flatten` | Real preview; flatten is destructive and gated |
| B18 | `/agent/*` (keys, whoami, due, strategies/:id/run, positions/close) | Scoped agent keys; wrong scope is refused |
| B19 | `/notifications/prefs`, `/devices/register`, `/notify/test` | Real persistence |
| B20 | `/limits`, `/limits/check`, `/catchup`, `/catchup/seen`, `/briefing`, `/basename`, `/x` | Real values |
| B21 | Auth boundary | Every non-public route returns 401 without a token |

## C. On-chain — real signed transactions and real reads

| # | Interaction | Correct means |
|---|---|---|
| C1 | `policyOf(owner)` | Returns delegate, cap, expiry, revoked — read live, no cache |
| C2 | `grant(delegate, cap, expiresAt, venues)` | User-signed; lands; `revoked:false` afterwards |
| C3 | `revoke()` | User-signed; `revoked:true` within one block; screen flips to STOPPED |
| C4 | ERC-20 `approve(delegation, MAX)` | Every tradable token, not just USDC |
| C5 | ERC-20 `approve(delegation, 0)` | User-signed; `allowance()` reads 0 afterwards |
| C6 | `spend(...)` via executor | Real fill with a tx hash; daily cap enforced |
| C7 | `closePosition(...)` | Exit path works for every approved token |
| C8 | `isVenueAllowed` | True for granted venues, false for a control address |
| C9 | Aqua `delegatedFillArgs` | Real fill through `XorrAquaBook` |
| C10 | Trailing stop | Fires when the trail floor is breached; not before |

## D. External integrations

| # | Integration | Correct means |
|---|---|---|
| D1 | Privy auth | Real OTP login; `verifyAuthToken` on every request |
| D2 | Privy embedded wallet | Real address; signs grant/revoke/approve |
| D3 | Privy policy | Read back from Privy's API; rules match the chain config |
| D4 | Privy key quorum | Owns the policy; unsigned change → 401; signed → 200 |
| D5 | Privy policy enforcement | Send to a non-listed address → "policy violation" |
| D6 | 1inch Aggregation v6 | Real quote and real swap calldata |
| D7 | 1inch Spot Price | Cross-check against CoinGecko |
| D8 | 1inch Aqua | Real book discovery and fill |
| D9 | CoinGecko | Live prices and OHLC; warming handled |
| D10 | The Graph | Live subgraph query with `_meta` health |
| D11 | Aave v3 | Live `currentLiquidityRate`; supply names the recipient |
| D12 | Basenames | Resolved where they exist; null otherwise |

## E. Edge cases and interruptions

| # | Case | Correct means |
|---|---|---|
| E1 | Submit an empty form | Button disabled or a stated reason; nothing created |
| E2 | Double-tap submit | Exactly one record created |
| E3 | Resubmit a succeeded form | Refused with a specific reason |
| E4 | Back mid-flow | Lands somewhere sensible, never a blank screen |
| E5 | Refresh mid-transaction | Recovers to the true on-chain state, no stuck modal |
| E6 | Executor unreachable | Banner appears; clears on recovery |
| E7 | Invalid address input | Rejected with an accurate reason (and `0X` accepted) |
| E8 | Unknown id in a URL | "No longer open", not a live form |
| E9 | Upstream 502 | The venue's own reason shown, not a generic placeholder |
| E10 | Cold price cache | 503 `warming` handled; no stampede |
| E11 | Expired permission | Warning shown; expired state explained |
| E12 | Delegate key mismatch | "Disconnected"; button re-grants rather than revoking |
| E13 | Short viewport | Every screen scrolls or fits |
| E14 | Kill switch while a trade is in flight | Revoke wins; close still allowed |
