# Strict flow test plan — zero tolerance

Written **before** testing, as the checklist every item below is measured against. "Correct" is
defined per item as a specific observable result. A pass means the observed result matches that
sentence exactly. "The button did something", "mostly works", and "no crash" are not passes.

**Surface under test:** the deployed build a stranger gets —
`https://web-production-3e214.up.railway.app` on Base Sepolia, backed by
`https://executor-production-1659.up.railway.app`, plus
`https://executor-fork-production.up.railway.app` on the Base mainnet fork where fills are real.

**Inventory:** 99 screens · 91 route handlers · 6 contracts · 14 external services.

## Global criteria — applied to EVERY item, not just the ones that look wrong

| ID | Criterion | Definition of correct |
|---|---|---|
| G1 | Console | Zero `error`-level console messages, excluding the two Privy SDK entries (`isActive`, `balanceOf`) which are third-party and attributed rather than excused. |
| G2 | Network | Zero failed requests. A 4xx that the UI *renders as a stated refusal* is a pass; a 4xx or 5xx the user never sees is a fail. |
| G3 | No 5xx | No route answers 5xx during any item. A slow upstream must answer `503 warming` with `retry-after` and a sentence, never a bare 500 and never a hang. |
| G4 | No mocks | No fixture, fallback constant, or stubbed branch supplies a value the UI presents as measured. Absence must render as absence. |
| G5 | Real money path | Every on-chain claim is a real signed transaction or a real contract read, on a real network, with a hash or a block that can be checked independently. |
| G6 | Values, not shapes | A screen passes on the VALUES it shows being right, not on it having rendered. "It has a number on it" is not a pass. |

## Section A — Screens (99)

Executed by `tools/shoot.mjs` against the deployed build in a real Chromium session signed in with
a real Privy account, asserting per-screen content patterns plus G1/G2 on every screen.
**Correct:** 99/99 report PASS with zero console and zero network failures.

Every screen's specific content expectation lives in the `EXPECT` map in that file — that map is
part of this plan, not separate from it. Spot-verified independently in Claude in Chrome for the
screens carrying the load-bearing claims (A-spot below).

| ID | Screen | Correct |
|---|---|---|
| A-spot-1 | `/limits` | Shows the on-chain cap for the signed-in wallet, matching `policyOf()` read directly from the contract. Not a database copy. |
| A-spot-2 | `/safety` | The four permission facts and a live/expired/stopped state matching the chain. |
| A-spot-3 | `/verify` | 21 checks, each with the call made and what came back. Failures shown as failures. |
| A-spot-4 | `/audit/anchor` | The head hash Base holds, its block, and whether the local trail still agrees. |
| A-spot-5 | `/route/WETH` | A live 1inch quote plus all three venues priced or refused with a reason. |
| A-spot-6 | `/bot` | Today's proposal or today's decline — never yesterday's, never blank. |
| A-spot-7 | `/strategies` | Every strategy with its real state; counter matches. |
| A-spot-8 | `/activity` + `/audit/chain` | The hash-chained trail and its verification verdict. |

## Section B — Endpoints (91)

**Correct for all:** authenticated routes reject a missing or invalid bearer token with 401 and a
sentence; every route that exists answers with its own handler (never a bare 404); no 5xx.

Executed by `server/src/routes/coverage.live.test.ts` (every path the client calls) plus the
per-domain live suites. Beyond existence, these carry specific value assertions:

| ID | Endpoint | Correct |
|---|---|---|
| B1 | `GET /limits` | `dailyCapUsd` equals `policyOf(owner).dailyCap / 1e6` read from chain. |
| B2 | `POST /limits/check` | Refuses a size above the on-chain remaining, naming the number. |
| B3 | `GET /verify` | 21 checks; `passed + failed + skipped == 21`; every `observed` non-empty. |
| B4 | `GET /audit/anchor` | `state` ∈ {match, ahead, diverged, none}; when not `none`, `latest.blockNo` exists on chain. |
| B5 | `POST /audit/anchor` | Publishes a real tx, or reports `unchanged` without spending gas. |
| B6 | `GET /activity/verify` | Re-hashes every row; reports content vs link breaks distinctly. |
| B7 | `GET /route/compare` | Names all three venues; each either an amount or a reason. |
| B8 | `GET /swap/quote` | A live 1inch quote; 502 with the upstream's reason when no route. |
| B9 | `GET /perp/:symbol` | Real price or `503 warming`; never a hang, never a bare 500. |
| B10 | `GET /yield/supply` | Aave `currentLiquidityRate` from the mainnet pool; never a zeroed struct read as 0%. |
| B11 | `POST /proposals/generate` | A real proposal or a real decline within 10s, else `503 warming`. |
| B12 | `POST /strategies` | Enforces the on-chain cap; refuses an agent that is not yours with `unknown_agent`. |
| B13 | `GET /graph/decision` | A decision derived from indexed data, with the rationale naming the source. |
| B14 | `GET /graph/health` | Indexed block and error state from `_meta`. |
| B15 | `GET /metrics` | Fill counts by venue, from the database. |
| B16 | `POST /orders` | Real signed transaction, or a stated refusal. Never a fabricated hash. |
| B17 | `GET /positions` | Real balances read from chain. |
| B18 | `GET /privy/policy` | Privy's own policy state, read from Privy's API. |
| B19 | `POST /panic/flatten` | Refuses without a delegation; otherwise sells for real. |
| B20 | Auth boundary | `/agent/*` demands an agent key; user routes demand a Privy token; neither accepts the other. |

## Section C — Contracts and on-chain (6)

| ID | Item | Correct |
|---|---|---|
| C1 | `XorrDelegation` deployed | `eth_getCode` returns bytecode at the configured address on Sepolia. |
| C2 | `policyOf` | Returns the live grant; the app shows the same numbers. |
| C3 | Guard: `NotDelegate` | A non-delegate calling `spend()` reverts with that error. |
| C4 | Guard: `VenueNotAllowed` | A venue outside the allowlist reverts. |
| C5 | Guard: `DailyCapExceeded` | Over-cap spend reverts with the two numbers. |
| C6 | Guard: `PolicyRevoked` | After `revoke()`, `spend()` reverts. |
| C7 | `XorrAuditAnchor` deployed | Code at `0xB58cB717…`; `latest()` returns the published head. |
| C8 | Anchor append-only | A second anchor follows rather than replaces; count never goes backwards. |
| C9 | `XorrSwapVMBook` fill | A real `fillForDelegation` through `spend()` on the fork, moving the maker's own tokens. |
| C10 | `XorrAquaBook` fill | A real Aqua fill through the delegation. |
| C11 | Contract suite | `forge test` — all pass. |

## Section D — External integrations (14)

**Correct for all:** the call is real, made with credentials in the environment, and a failure is
reported as a failure rather than replaced with a plausible number.

| ID | Service | Correct |
|---|---|---|
| D1 | 1inch Aggregation v6 | A live quote naming real pools. |
| D2 | 1inch Aqua | Books discovered from Aqua's own logs. |
| D3 | 1inch SwapVM | Programs discovered; a fill that clears the floor. |
| D4 | The Graph (delegation) | `_meta` synced, policy and spends queryable. |
| D5 | Privy auth | A real token verified by the same path production uses. |
| D6 | Privy policy engine | Refuses a transaction to an address it does not name. |
| D7 | Aave v3 | `getReserveData` on the Base pool. |
| D8 | CoinGecko | Live prices for every priceable symbol. |
| D9 | EDGAR / SEC | Real filings for the equities. |
| D10 | Basenames | Resolution for an address that has one. |
| D11 | Base Sepolia RPC | Chain id and head block. |
| D12 | Base mainnet RPC | Equity token reads; throttle handled, not silently absorbed. |
| D13 | News feed | Real headlines. |
| D14 | LLM (OpenRouter) | **Expected UNTESTABLE** — `OPENROUTER_API_KEY` exists nowhere. Correct behaviour is an honest refusal on every surface, never a canned sentence. |

## Section E — Flows and edge cases (driven by hand in Claude in Chrome)

| ID | Flow | Correct |
|---|---|---|
| E1 | Sign in | Real Privy OTP; a wallet address appears and the server resolves the SAME address. |
| E2 | Grant permission | Four facts shown, user signs, chain reflects it, `/safety` flips to live. |
| E3 | Create recurring buy | Creates, appears in `/strategies` as Live, writes a trail entry naming the first run in a stated timezone. |
| E4 | Pause / resume | State flips both ways; the running counter tracks it. |
| E5 | Create alert | Persists with `enabled` and `armed` true. |
| E6 | Alert edge: unpriceable symbol | Submit disabled, message names the symbol, nothing is written. |
| E7 | Swap screen with no balance | A real quote AND an honest block: "You hold no WETH." |
| E8 | Bot chat | A question reaches the agent; with no model configured it refuses honestly. |
| E9 | Bot decline | Today's decline appears under a Today divider; a stale one is not shown as current. |
| E10 | Anchor now | Publishes, and the screen shows the new commitment — not "not yet anchored". |
| E11 | Kill switch | Revoke on chain → screen reads STOPPED → `spend()` reverts. |
| E12 | Cross-tenant isolation | A second real account sees none of the first's data, in both directions. |
| E13 | Unknown route | The app's own 404, not a stack trace and not a blank page. |
| E14 | Signed-out state | Authenticated screens state that sign-in is required rather than showing empty data as fact. |
| E15 | Interrupted flow | Navigating away mid-request leaves no orphaned write and no unhandled rejection. |
| E16 | Invalid input | A malformed tx hash to `/delegation/record` is refused by schema, not written. |
| E17 | Over-cap strategy | Refused with the cap named, and the refusal is visible above the button. |
| E18 | Duplicate submit | Pressing create twice does not create two. |

## Status legend

`PASS` — observed result matched the sentence above, with G1–G6 clean.
`FAIL` — anything else. Root cause fixed, then re-run from the start.
`UNTESTED` — a real dependency does not exist. Stated, never counted as a pass.
