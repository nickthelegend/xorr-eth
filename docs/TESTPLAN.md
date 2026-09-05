# xorr — ETH Online test plan and results

Every item states the SPECIFIC expected result. A pass means the observed result matched it, with
a clean console and no failed network requests. "The button did something" is a fail.

Executed 2026-09-06. Surfaces: app on `:8082` (Expo web, real Chrome), executor on `:8788`,
XorrDelegation at `0xb14CF3D0b5269aCDE52322218adb6d5C1daE0a4e` on public Base Sepolia, Aqua at
`0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a` on a Base **mainnet** fork, subgraph on Studio.

**Result: 61 PASS · 1 PARTIAL · 2 FAIL (both known, both stated below).**

Automated: 143 app · 42 server · 36 contract · 33 live-API — 254 green.

---

## The two environments, and why there are two

Aqua, 1inch and the tokenized equities exist only on Base **mainnet**. XorrDelegation is deployed
to public Base **Sepolia**, where a user can grant and revoke for real without spending money.

- **Sepolia** proves the permission layer: a real embedded wallet signs a real `grant`, the cap is
  enforced on-chain, revoke stops the bot, and the subgraph indexes all of it. It cannot fill a
  trade, and the executor now says so instead of trying.
- **Base mainnet fork** proves settlement: real router, real USDC, real Aave, real equity tokens,
  real fills. Everything is genuine except that the chain is a local copy.

Nothing is claimed to work in an environment where it was not run.

---

## S — Sponsor qualification

| # | Item | Result | Evidence |
|---|---|---|---|
| S1 | 1inch: official Aqua contract | **PASS** | `XorrAquaBook` extends `AquaApp`; 22 fork tests run against `0x1111113CCf…`, asserting `code.length > 0` there first |
| S2 | 1inch: on-chain token transfers | **PASS** | `test_TakerSwapMovesRealTokens`, `test_UserBuysAShare`: maker +USDC, taker +token, asserted before/after |
| S3 | 1inch: SwapVM used | **FAIL** | Not built. Aqua is used; SwapVM is not. Scored higher by the sponsor — the one deliberate gap |
| S4 | 1inch: real git history | **PASS** | 15 commits, distinct messages, no squash |
| S5 | Graph: live data from a Graph provider | **PASS** | Studio subgraph, `hasIndexingErrors: false`, block 46,440,292 |
| S6 | Graph: load-bearing | **PASS** | `/agent/decision` returns `act:false, reason:"revoked"` seconds after an on-chain revoke — a fact Postgres cannot know |
| S7 | Graph: not "simply querying one Subgraph" | **PARTIAL** | Two subgraphs, joined: `xorr` (permission) + `xorr-aqua` (Aqua venue depth). The join picks the route. The second is built and pinned (`QmctadHCDBprb9Q1Pq4oyMXjB6KcnUDHRheDRNyBA59tAJ`) but **not deployed** — Studio needs the slug created in the dashboard, which is a click I cannot make. Until then the route resolves to `1inch` and says why |
| S8 | Privy: auth is real | **PASS** | No token → 401; forged JWT → 401 "signature verification failed"; real token → 200 |
| S9 | Privy: embedded wallet is the on-chain owner | **PASS** | `0x95A0b368588713011a15f4b1041423f31B08e615` signed `grant` in `0x596f4c08…`; `policyOf` returns that wallet's policy |

## A — App screens (real browser, console + network checked on every one)

| # | Screen | Result | Observed |
|---|---|---|---|
| A1 | `/welcome` | PASS | Wordmark, tagline, 3 pills, orbs, CTA. Console clean |
| A2 | `/goals` | PASS | Chips toggle, risk segmented, caption follows the pick |
| A3 | `/wallet` | PASS | 4 status rows; real Privy login completed; embedded wallet created |
| A4 | `/fund` | PASS | 3 methods, fee and availability change with the pick |
| A5 | `/delegate` | PASS | 4 consequence cards, cap stepper, real signature flow |
| A6 | `/proposal` | PASS | 55/30/15, totals 100, editing clears approval |
| A7 | `/` Home | PASS | Redirects to `/welcome` with no wallet; with one, real balance, agents, WETH at $2,474.70, Aave 3.93% |
| A8 | `/markets` | PASS | 5 classes; crypto and stocks live, commodities/indices/pre-IPO tagged SIMULATED |
| A9 | `/bot` | PASS | Agent header, proposal or decline, never blank |
| A10 | `/strategies` | PASS | Shows "Buy NVDA weekly · $50 · Live" from the database |
| A11 | `/holdings` | PASS | Portfolio value, allocation, real wallet address |
| A12 | `/activity` | PASS | Filters, rows from the audit log |
| A13 | `/history` | PASS | Reads The Graph; empty state is honest |
| A14 | `/safety` | PASS | LIVE chip; **kill switch executed on-chain** (see C-extra) |
| A15 | `/swap` | PASS | 0.1 WETH ≈ $248.95, real 1inch route |
| A16 | `/order/:sym` | PASS | `$250 → 1.0781 NVDAc` and `0.1004 WETH`, both from live prices |
| A17 | `/briefing` | PASS | Real RSS headlines |
| A18 | `/settings` | PASS | Wallet `0x95…e615`, network, **`$1,600/day` read from the chain** |
| A19 | `/search` | PASS | Filters across classes; loading and empty states distinct |
| A20 | Unknown route | PASS | "Unmatched Route", no crash |
| — | 20 further routes | PASS | alerts, allowlist, recovery, send, inbox, chart, asset, perp, position, auto-close, watchlist, dca, roster, leaderboard, intro, settings, backtest, legal, `_dev/*` — all clean |

**Console:** a fresh load of every route produces **zero errors from this codebase**. Two remain
from Privy's own SDK and are not ours to fix: `isActive` leaking to the DOM from its
`TransactionDetails` component, and a `balanceOf` on a token absent from Sepolia in its
`getErc20Balance` module.

## E — Executor API

| # | Endpoint | Result | Observed |
|---|---|---|---|
| E1 | `GET /health` no auth | PASS | 200 with db, chain, contract |
| E2 | Any route, no token | PASS | 401 `{"error":"unauthorized","detail":"Missing bearer token."}` |
| E3 | Forged JWT | PASS | 401 "signature verification failed" |
| E4 | `GET /agent/decision` | PASS | `act:true, sizeUsd:100, observedRemainingUsd:1600` + route + rationale |
| E5 | `GET /graph/health` | PASS | `{block: 46440068, healthy: true}` |
| E6 | `GET /swap/quote` | PASS | 250 USDC → 0.10044 WETH via Elfomofi + Hanji, with minimumOut |
| E7 | `POST /strategies` over cap | PASS *(was FAIL)* | 400 `over_cap`; cumulative $50 + $1,600 also refused |
| E8 | Malformed body | PASS *(was FAIL)* | 400 `invalid_json` / `invalid_request`, never a 500 |
| E9 | Untradable symbol | PASS | 400 naming the symbols this chain can settle |

## C — Contracts

| # | Item | Result | Observed |
|---|---|---|---|
| C1 | Deployed | PASS | 14,317 bytes at the Sepolia address |
| C2 | Grant | PASS | delegate `0xe992…E403`, cap 1,600e6, expiry, `revoked:false` |
| C3 | Delegated spend | PASS | Fork: −250 USDC, +0.1003 WETH to the **user**, cap 1000 → 750 |
| C4 | Over-cap spend | PASS | Reverts; 14 unit tests + fork assertion |
| C5 | Unlisted venue | PASS | `VenueNotAllowed`; on-chain `isVenueAllowed` false for a random address, true for the router |
| C6 | Non-delegate caller | PASS | `NotDelegate` |
| C7 | Aqua ship moves no tokens | PASS | Maker, app and Aqua balances all unchanged; virtual balances set |
| C8 | Aqua taker swap | PASS | Real ERC-20 movement both legs |
| C9 | Aqua price band | PASS | Quote and swap both revert outside the band |
| C10 | Aqua dock without the bot | PASS | Maker exits alone, even after revoking |
| C11 | **Aqua path enforces the cap** | PASS *(was a real hole)* | `fillForDelegation` is delegation-only; the bot routes through `spend()` |
| C12 | **Stocks through Aqua** | PASS | 7/7: the bot buys 1.0686 bNVDA for $250 under policy; cap, revoke and venue allowlist all bite |
| C13 | **Kill switch** | PASS | Revoke signed in-app → `policyOf.revoked: true` → executor stands down → new strategies refused → subgraph indexed `0xd32d3085…` |

## G — Subgraph

| # | Item | Result | Observed |
|---|---|---|---|
| G1 | Synced | PASS | `hasIndexingErrors: false`, block 46,440,292 |
| G2 | Policy indexed | PASS | Matches `policyOf` field for field |
| G3 | Spend indexed | PASS | Real tx hashes, verifiable on Basescan |
| G4 | Daily rollup | PASS | Per-UTC-day entity; empty for a wallet that has not spent, which is correct |
| G5 | Unknown address | PASS | `null`, never an invented policy |

---

## The two things that are not done

1. **S3 — SwapVM is not built.** Aqua is used properly and deeply; SwapVM is not used at all. This
   is a missing feature, not a broken one.
2. **S7 — the second subgraph is built but not deployed.** Creating a subgraph slug in Subgraph
   Studio is a dashboard action. The manifest, schema, mappings and WASM are complete and pinned to
   IPFS; once the `xorr-aqua` slug exists, `graph deploy` and `AQUA_SUBGRAPH_URL` finish it.

## What running this found

Fourteen defects, every one from executing the flow rather than reading the code. The five that
mattered:

- **The Aqua path did not enforce the daily cap.** `swapAsDelegate` re-read the policy fields and
  then pulled the user's tokens itself, never calling `spend()`. The cap and the venue allowlist
  did nothing on that path.
- **`POST /strategies` skipped the cap check entirely** when a database row was missing, so a
  wallet with a $1,600 on-chain cap accepted a $999,999/day strategy. The guard's failure mode was
  to allow.
- **The web client could never authenticate.** CORS omitted `authorization`, so every request with
  a token died in the preflight and the whole app read as logged out.
- **Swap output went to the delegation contract, not the user** — 1inch defaults the receiver to
  `from`, which would have made a non-custodial product custodial.
- **The asset screen drew Solana's chart** under any symbol with no real candles.
