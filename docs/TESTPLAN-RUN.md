# Test plan — full-surface run

48 app routes, 72 server routes, the contract, and four external integrations. Written before any
testing, so it is a checklist rather than a description of whatever happened to work.

**"Correct" is stated per item as a specific observable result.** "Loads", "works" and "the button
does something" are not pass conditions. An item fails if the observed result differs at all, or if
the browser console shows any error while performing it.

**Environment.** Web build at `localhost:8082` in Chrome, pointed at
`executor-fork-production.up.railway.app` (chain 8453, base-fork). Signed-out and signed-in states
both exercised. Console read on every item.

Status legend: `PASS` · `FAIL` · `FIXED` (failed, root cause fixed, re-verified) · `UNTESTABLE`
(states the missing dependency).

---

## A — Signed-out surface

| # | Item | Correct means | Status |
|---|---|---|---|
| A1 | `/` with no session | Redirects to `/welcome`; no flash of signed-in chrome | PASS |
| A2 | `/welcome` | Wordmark, one card, "Get started"; no console error | PASS |
| A3 | `/goals` | 5 chips + 3-way risk; Continue disabled at 0 selected, enabled at ≥1; caption names the risk level | PASS |
| A4 | `/wallet` empty email | "Email me a code" disabled | PASS |
| A5 | `/wallet` invalid email (`abc`) | Button stays disabled | PASS |
| A6 | `/wallet` arbitrary valid email | Accepts it, reveals the CODE field, no error — a judge with an inbox can proceed | PASS |
| A7 | `/wallet` wrong OTP | Red text "Invalid email and code combination"; stays on step 2 | PASS |
| A8 | `/wallet` refresh mid-flow | Returns to the email step cleanly; no stuck spinner, no crash | PASS |
| A9 | `/activity` signed out | "Not signed in, so /activity was not requested" — never invented rows | PASS |
| A10 | `/judge` signed out | ≥14 PASS, 6 SKIP, 0 FAIL, and the words "Skipped is not passed" | PASS |
| A11 | `/safety` signed out | Must not simultaneously claim the permission is live and that nothing is granted | **FIXED** |
| A12 | `/markets/crypto` signed out | 9 rows, live prices, no SIMULATED tag on crypto | PASS |
| A13 | `/watchlist` default tab | Every visible row shows either a real price or a labelled dash — no silent blanks | **FIXED** |

## B — Onboarding, signed in

| # | Item | Correct means | Status |
|---|---|---|---|
| B1 | Sign in with a Privy test account | 4 steps go green; no raw SDK text anywhere on screen | PASS |
| B2 | Returning user re-signs in | Same as B1 — specifically no "Wallet already exists" | **FIXED** |
| B3 | `/fund` | $500 default, 4 quick amounts, 3 methods, card on-ramp visibly disabled and labelled | PASS (iOS) |
| B4 | `/delegate` | Four limit rows, cap stepper, duration; on a fork build the blocked note is visible **above** the CTA and the CTA is disabled | **FIXED** (iOS) |
| B5 | `/proposal` | Weights total 100; CTA disabled until they do | not reached |
| B6 | Sign out (Settings → Session) | Two-tap confirm, returns to `/welcome`, store cleared | PASS (iOS) |

## C — Tabs

| # | Item | Correct means | Status |
|---|---|---|---|
| C1 | Home | Total + Cash are two different real numbers; "in the last day" counts; no $0.00 placeholder | **FIXED** |
| C2 | Markets loading | Skeleton rows + "Loading · 24/7" — never "0 shown" over a blank screen | **FIXED** |
| C3 | Markets classes | All 5 chips switch; commodities show SIMULATED where unpriced | PASS |
| C4 | Strategies (Trade) | Running list with real next-run dates; Add-new shows 7 tiers | PASS |
| C5 | Agents (Bot) | Chat renders; a question returns either a model answer or an explicit "no language model configured" — never a canned line presented as an answer | **FIXED** (iOS) |
| C6 | Assets (Holdings) | "Target mix" (not "Allocation") with the approved weights; Holdings separate | **FIXED** |

## D — Trading

| # | Item | Correct means | Status |
|---|---|---|---|
| D1 | `/asset/BTC` | Live price, candles, timeframe pills switch | PASS |
| D2 | `/asset/NVDAc` on fork | Buy/Sell absent; refusal names the actual chain, not "Base" | **FIXED** |
| D3 | Buy/Sell never render live before settleability is known | Controls disabled while checking, never enabled-then-withdrawn | **FIXED** |
| D4 | `/order/CBBTC` Max | Fills spendable **cash**, not total portfolio value | **FIXED** |
| D5 | `/order` amount 0 | CTA disabled, "At worst —" | PASS |
| D6 | `/order` over balance | Red "more than the $X you have settled"; CTA disabled | PASS (iOS) |
| D7 | `/order` double-submit | Exactly one request leaves; guarded | PASS (iOS) |
| D8 | `/order` real buy | Either a fill with units + hash, or a refusal in the executor's own words. Never an infinite spinner | PASS (iOS) |
| D9 | `/swap` | Pay amount renders with decimals (0.1000, not 0); route + price impact real | **FIXED** (iOS) |
| D10 | `/swap` Review | Opens the order ticket on Sell with the amount carried across | **FIXED** (iOS) |
| D11 | `/send` no allowlist | "Add a destination to your allowlist first"; Send disabled | PASS (iOS) |
| D12 | `/allowlist` empty | Explicit empty state, not a blank screen | **FIXED** (iOS) |
| D13 | `/allowlist` invalid address | "not a Base address… 0x and 42 characters"; Add disabled | PASS (iOS) |

## E — Strategy tiers

| # | Item | Correct means | Status |
|---|---|---|---|
| E1 | DCA sheet targets | WETH + CBBTC only — never USDC, which cannot swap for itself | **FIXED** |
| E2 | DCA over daily cap | Executor's sentence, visible **above** the button, naming both numbers | **FIXED** (iOS) |
| E3 | DCA next-three-runs | Three real future dates matching the cadence | PASS |
| E4 | `POST /strategies` USDC via API | 400 `not_settleable_here` — the guard is server-side, not just client-side | **FIXED in repo · FAILS on the deployment** |
| E5 | Grid sheet | Bounds + rung inputs; CTA disabled until valid | not reached |
| E6 | Yield sheet | Real Aave rate; CTA reflects the amount | not reached |
| E7 | Exit rules | TP/SL steppers seeded from the armed rule | not reached |
| E8 | Tier list | All 7 tiers present and each opens | PASS (iOS) |

## F — Safety and permission

| # | Item | Correct means | Status |
|---|---|---|---|
| F1 | `/safety` signed in | Agent/strategy count matches what can actually place orders | **FIXED** |
| F2 | Kill switch on a fork build | Disabled, with the blocking reason visible above it — never silently inert | **FIXED** (iOS) |
| F3 | Kill-switch failure text | A sentence; never an RPC URL, request body or viem version | **FIXED** (iOS) |
| F4 | `/flatten` | Names what it would sell, with a real total | PASS (iOS) |
| F5 | `/recovery` | Loads; acknowledgement persists | not reached |
| F6 | Settings status/cap | Reads the chain: "Live" and the signed cap, matching `/verify` | **FIXED** |

## G — Data screens

| # | Item | Correct means | Status |
|---|---|---|---|
| G1 | `/activity` | Real rows with hashes; back control present | **FIXED** |
| G2 | `/activity` filters | All/Trades/Risk/Blocked each change the list | not reached |
| G3 | `/history` | Real indexed spends, or an honest "nothing settled on chain yet" | PASS (iOS) |
| G4 | `/inbox` | Real events; back control present | PASS (iOS) |
| G5 | `/alerts` | List + back control | not reached |
| G6 | `/alerts/new` | Level seeded near the live price, not a fixed constant | **FIXED** (iOS) |
| G7 | `/search` no match | `Nothing matches "zzzz".` | PASS (iOS) |
| G8 | `/briefing` | Loads with back control | not reached |
| G9 | `/bot/roster` | 4 agents, honest "No trades yet" | PASS (iOS) |
| G10 | `/position/[id]`, `/chart`, `/perp`, `/legal` | Each loads without console error | not reached |

## H — Server API (checked directly, not through the UI)

| # | Item | Correct means | Status |
|---|---|---|---|
| H1 | `GET /health` | `ok:true`, dependencies up, chain named | PASS |
| H2 | `GET /verify` no wallet | 14 pass / 0 fail / 6 skip | PASS |
| H3 | `GET /verify?owner=` | 19 pass / 0 fail / 1 skip | PASS |
| H4 | Auth on private routes | 401 `Missing bearer token`, never data | PASS |
| H5 | `GET /market/quotes` | Real prices, `source` named | PASS |
| H6 | `GET /perp/:symbol` | Real mark; unknowable fields `null` + listed in `unavailable` | PASS |
| H7 | `GET /swap/quote` | Real 1inch route | PASS |
| H8 | Rate limiting | Sustained burst returns 429, `/health` exempt | PASS |

## I — On-chain and contract

| # | Item | Correct means | Status |
|---|---|---|---|
| I1 | `XorrDelegation` deployed | Code present at the configured address on both chains | PASS |
| I2 | Policy read from chain | Cap/expiry/revoked match `/verify` | PASS |
| I3 | Venue allowlist enforced | Granted venues allowed, a control address denied | PASS |
| I4 | Audit chain unbroken | Every row hashes to its contents, linked to its predecessor | PASS |
| I5 | Idempotency | Unique index prevents two runs in one period | PASS |

## J — External integrations

| # | Item | Correct means | Status |
|---|---|---|---|
| J1 | Privy auth | `verifyAuthToken` gates every private route | PASS |
| J2 | Privy policy refusal | A real `eth_sendTransaction` to an unlisted address is refused | PASS |
| J3 | 1inch aggregation | Real quote and real settled fill | PASS |
| J4 | 1inch Aqua | Reachable on the deployment under test, or explicitly recorded as not | **FAIL — unreachable on this deployment** |
| J5 | The Graph | Subgraph synced, queried, and its role on this deployment stated accurately | PASS (inert here) |
| J6 | Aave on Base | Rate read from the pool | PASS |
| J7 | Basenames | Reverse resolution correct against real Base | PASS |
| J8 | SEC EDGAR | Real filings drive tier 7 dates | PASS |

## K — Cross-cutting

| # | Item | Correct means | Status |
|---|---|---|---|
| K1 | Console, whole surface | Zero errors on every route visited | PASS |
| K2 | Network | No failed requests the UI hides | PASS |
| K3 | No mocks | No mock/stub/fake data in any shipped path | PASS |
| K4 | Claims match reality | Every claim in README/SUBMISSION is true of the code as it stands | **FIXED** |
| K5 | Lint / typecheck / tests | All clean | PASS |

---

## Result

**88 items.** 40 PASS in Chrome this run · 13 PASS verified earlier on the iOS simulator ·
23 FIXED (14 in Chrome, 9 on iOS) · 9 not reached · 2 that do not pass and say so.

### The two that do not pass

| # | What | Why it is not a pass |
|---|---|---|
| E4 | `POST /strategies` with `symbol: USDC` | Fixed in the repo, **not on the running executor**. Probed live: returned `200` and created a live strategy. The probe row was deleted immediately. Deploying `executor-fork` closes it; deploying means pushing, which was not mine to do unasked. |
| J4 | 1inch Aqua reachable | `fork-bootstrap.ts` deploys `XorrAquaBook` and never calls `ship`, and books are discovered from `BookShipped`. So no book exists on the current anvil and the Aqua branch falls through to the aggregator. Running `server/src/live-aqua.ts` after a rebuild closes it. |

### The nine not reached

`/proposal`, the grid / yield / exit-rule sheets, `/recovery`, `/alerts`, `/briefing`, the activity
filters, and `/position` `/chart` `/perp` `/legal`. Not tested in this run, so not marked either
way. Listing them as PASS would have made the table look finished and meant nothing.

### Zero mocks

Three matches for `mock|stub|dummy|faker` across `app/`, `src/` and `server/src/`, all benign:
`src/test/react-native-stub.ts` (a Node shim imported only by unit tests), and two comments that
say "not a mock". No fixture supplies a number that reaches a screen — fixtures carry symbol lists,
sleeve names and copy, and every price, rate, route, balance and date is fetched.

### Zero console errors

Read on every item. Across the whole surface: **no errors, no exceptions, no failed requests the UI
hides.** The only console output is ~26 styled-components dev warnings emitted by Privy's own SDK.

### Gates

`tsc --noEmit` clean · `eslint` clean · **385 app tests + 189 server tests, all passing.**

### One caveat worth stating

`/order/[symbol]` opened as a **direct URL** never loads the balance, so "Max" stays inert there.
Reached the normal way — asset → Buy — it fills $24,207, the spendable cash. The destructive part
(Max wiping the amount) is fixed; the deep-link data load is not, and is recorded here rather than
rounded up.
