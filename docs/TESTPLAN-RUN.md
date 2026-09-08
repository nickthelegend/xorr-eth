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
| A1 | `/` with no session | Redirects to `/welcome`; no flash of signed-in chrome | |
| A2 | `/welcome` | Wordmark, one card, "Get started"; no console error | |
| A3 | `/goals` | 5 chips + 3-way risk; Continue disabled at 0 selected, enabled at ≥1; caption names the risk level | |
| A4 | `/wallet` empty email | "Email me a code" disabled | |
| A5 | `/wallet` invalid email (`abc`) | Button stays disabled | |
| A6 | `/wallet` arbitrary valid email | Accepts it, reveals the CODE field, no error — a judge with an inbox can proceed | |
| A7 | `/wallet` wrong OTP | Red text "Invalid email and code combination"; stays on step 2 | |
| A8 | `/wallet` refresh mid-flow | Returns to the email step cleanly; no stuck spinner, no crash | |
| A9 | `/activity` signed out | "Not signed in, so /activity was not requested" — never invented rows | |
| A10 | `/judge` signed out | ≥14 PASS, 6 SKIP, 0 FAIL, and the words "Skipped is not passed" | |
| A11 | `/safety` signed out | Must not simultaneously claim the permission is live and that nothing is granted | |
| A12 | `/markets/crypto` signed out | 9 rows, live prices, no SIMULATED tag on crypto | |
| A13 | `/watchlist` default tab | Every visible row shows either a real price or a labelled dash — no silent blanks | |

## B — Onboarding, signed in

| # | Item | Correct means | Status |
|---|---|---|---|
| B1 | Sign in with a Privy test account | 4 steps go green; no raw SDK text anywhere on screen | |
| B2 | Returning user re-signs in | Same as B1 — specifically no "Wallet already exists" | |
| B3 | `/fund` | $500 default, 4 quick amounts, 3 methods, card on-ramp visibly disabled and labelled | |
| B4 | `/delegate` | Four limit rows, cap stepper, duration; on a fork build the blocked note is visible **above** the CTA and the CTA is disabled | |
| B5 | `/proposal` | Weights total 100; CTA disabled until they do | |
| B6 | Sign out (Settings → Session) | Two-tap confirm, returns to `/welcome`, store cleared | |

## C — Tabs

| # | Item | Correct means | Status |
|---|---|---|---|
| C1 | Home | Total + Cash are two different real numbers; "in the last day" counts; no $0.00 placeholder | |
| C2 | Markets loading | Skeleton rows + "Loading · 24/7" — never "0 shown" over a blank screen | |
| C3 | Markets classes | All 5 chips switch; commodities show SIMULATED where unpriced | |
| C4 | Strategies (Trade) | Running list with real next-run dates; Add-new shows 7 tiers | |
| C5 | Agents (Bot) | Chat renders; a question returns either a model answer or an explicit "no language model configured" — never a canned line presented as an answer | |
| C6 | Assets (Holdings) | "Target mix" (not "Allocation") with the approved weights; Holdings separate | |

## D — Trading

| # | Item | Correct means | Status |
|---|---|---|---|
| D1 | `/asset/BTC` | Live price, candles, timeframe pills switch | |
| D2 | `/asset/NVDAc` on fork | Buy/Sell absent; refusal names the actual chain, not "Base" | |
| D3 | Buy/Sell never render live before settleability is known | Controls disabled while checking, never enabled-then-withdrawn | |
| D4 | `/order/CBBTC` Max | Fills spendable **cash**, not total portfolio value | |
| D5 | `/order` amount 0 | CTA disabled, "At worst —" | |
| D6 | `/order` over balance | Red "more than the $X you have settled"; CTA disabled | |
| D7 | `/order` double-submit | Exactly one request leaves; guarded | |
| D8 | `/order` real buy | Either a fill with units + hash, or a refusal in the executor's own words. Never an infinite spinner | |
| D9 | `/swap` | Pay amount renders with decimals (0.1000, not 0); route + price impact real | |
| D10 | `/swap` Review | Opens the order ticket on Sell with the amount carried across | |
| D11 | `/send` no allowlist | "Add a destination to your allowlist first"; Send disabled | |
| D12 | `/allowlist` empty | Explicit empty state, not a blank screen | |
| D13 | `/allowlist` invalid address | "not a Base address… 0x and 42 characters"; Add disabled | |

## E — Strategy tiers

| # | Item | Correct means | Status |
|---|---|---|---|
| E1 | DCA sheet targets | WETH + CBBTC only — never USDC, which cannot swap for itself | |
| E2 | DCA over daily cap | Executor's sentence, visible **above** the button, naming both numbers | |
| E3 | DCA next-three-runs | Three real future dates matching the cadence | |
| E4 | `POST /strategies` USDC via API | 400 `not_settleable_here` — the guard is server-side, not just client-side | |
| E5 | Grid sheet | Bounds + rung inputs; CTA disabled until valid | |
| E6 | Yield sheet | Real Aave rate; CTA reflects the amount | |
| E7 | Exit rules | TP/SL steppers seeded from the armed rule | |
| E8 | Tier list | All 7 tiers present and each opens | |

## F — Safety and permission

| # | Item | Correct means | Status |
|---|---|---|---|
| F1 | `/safety` signed in | Agent/strategy count matches what can actually place orders | |
| F2 | Kill switch on a fork build | Disabled, with the blocking reason visible above it — never silently inert | |
| F3 | Kill-switch failure text | A sentence; never an RPC URL, request body or viem version | |
| F4 | `/flatten` | Names what it would sell, with a real total | |
| F5 | `/recovery` | Loads; acknowledgement persists | |
| F6 | Settings status/cap | Reads the chain: "Live" and the signed cap, matching `/verify` | |

## G — Data screens

| # | Item | Correct means | Status |
|---|---|---|---|
| G1 | `/activity` | Real rows with hashes; back control present | |
| G2 | `/activity` filters | All/Trades/Risk/Blocked each change the list | |
| G3 | `/history` | Real indexed spends, or an honest "nothing settled on chain yet" | |
| G4 | `/inbox` | Real events; back control present | |
| G5 | `/alerts` | List + back control | |
| G6 | `/alerts/new` | Level seeded near the live price, not a fixed constant | |
| G7 | `/search` no match | `Nothing matches "zzzz".` | |
| G8 | `/briefing` | Loads with back control | |
| G9 | `/bot/roster` | 4 agents, honest "No trades yet" | |
| G10 | `/position/[id]`, `/chart`, `/perp`, `/legal` | Each loads without console error | |

## H — Server API (checked directly, not through the UI)

| # | Item | Correct means | Status |
|---|---|---|---|
| H1 | `GET /health` | `ok:true`, dependencies up, chain named | |
| H2 | `GET /verify` no wallet | 14 pass / 0 fail / 6 skip | |
| H3 | `GET /verify?owner=` | 19 pass / 0 fail / 1 skip | |
| H4 | Auth on private routes | 401 `Missing bearer token`, never data | |
| H5 | `GET /market/quotes` | Real prices, `source` named | |
| H6 | `GET /perp/:symbol` | Real mark; unknowable fields `null` + listed in `unavailable` | |
| H7 | `GET /swap/quote` | Real 1inch route | |
| H8 | Rate limiting | Sustained burst returns 429, `/health` exempt | |

## I — On-chain and contract

| # | Item | Correct means | Status |
|---|---|---|---|
| I1 | `XorrDelegation` deployed | Code present at the configured address on both chains | |
| I2 | Policy read from chain | Cap/expiry/revoked match `/verify` | |
| I3 | Venue allowlist enforced | Granted venues allowed, a control address denied | |
| I4 | Audit chain unbroken | Every row hashes to its contents, linked to its predecessor | |
| I5 | Idempotency | Unique index prevents two runs in one period | |

## J — External integrations

| # | Item | Correct means | Status |
|---|---|---|---|
| J1 | Privy auth | `verifyAuthToken` gates every private route | |
| J2 | Privy policy refusal | A real `eth_sendTransaction` to an unlisted address is refused | |
| J3 | 1inch aggregation | Real quote and real settled fill | |
| J4 | 1inch Aqua | Reachable on the deployment under test, or explicitly recorded as not | |
| J5 | The Graph | Subgraph synced, queried, and its role on this deployment stated accurately | |
| J6 | Aave on Base | Rate read from the pool | |
| J7 | Basenames | Reverse resolution correct against real Base | |
| J8 | SEC EDGAR | Real filings drive tier 7 dates | |

## K — Cross-cutting

| # | Item | Correct means | Status |
|---|---|---|---|
| K1 | Console, whole surface | Zero errors on every route visited | |
| K2 | Network | No failed requests the UI hides | |
| K3 | No mocks | No mock/stub/fake data in any shipped path | |
| K4 | Claims match reality | Every claim in README/SUBMISSION is true of the code as it stands | |
| K5 | Lint / typecheck / tests | All clean | |
