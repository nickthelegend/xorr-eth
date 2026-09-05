# xorr — ETH Online test plan

Every item states the SPECIFIC expected result. A pass means the observed result matches it
exactly, with a clean console and no failed network requests. "The button did something" is a fail.

Surfaces: app on `:8082` (Expo web), executor on `:8788`, XorrDelegation on Base Sepolia
(`0xb14CF3D0b5269aCDE52322218adb6d5C1daE0a4e`), Aqua on a Base mainnet fork, subgraph on Studio.

---

## S — Sponsor qualification (the items that decide prize eligibility)

| # | Item | Correct means |
|---|---|---|
| S1 | 1inch: official Aqua contract used | `XorrAquaBook` extends 1inch `AquaApp`; tests execute against `0x1111113CCf…` with real code at that address on the fork |
| S2 | 1inch: on-chain token transfers demonstrated | A taker swap moves real ERC-20 balances; maker +USDC, taker +WETH, asserted before/after |
| S3 | 1inch: SwapVM used | A SwapVM program prices or gates a book. Scored higher by the sponsor |
| S4 | 1inch: git history not a single commit | ≥5 commits with distinct messages |
| S5 | Graph: live data from a Graph provider | Query hits Subgraph Studio and returns indexed rows; not local, not static |
| S6 | Graph: load-bearing, meaningful work | Agent DECISION changes based on indexed data; a stand-down reason is produced that Postgres cannot know |
| S7 | Graph: not "simply querying one subgraph" | Decision logic consumes ≥2 entity types and alters behaviour |
| S8 | Privy: auth is real | Unauthenticated request rejected; forged JWT rejected; valid session accepted |
| S9 | Privy: embedded wallet | A wallet address exists for the logged-in user and is the `owner` in the on-chain policy |

## A — App screens (browser)

| # | Screen | Correct means |
|---|---|---|
| A1 | `/welcome` | XORR wordmark, tagline, 3 preview pills, 3 orbs, blue CTA. Console clean |
| A2 | `/goals` | 5 goal chips toggle; 3-way risk segmented; caption changes with pick; Continue disabled at 0 goals |
| A3 | `/wallet` | 4 status rows; email field; Privy iframe present; step advances only after real login |
| A4 | `/fund` | 3 methods; selecting changes fee + availability; availability is a computed date, never a fixed string |
| A5 | `/delegate` | 4 consequence cards incl. "cannot move your money out"; cap stepper; Run For pill |
| A6 | `/proposal` | 3 sleeves at 55/30/15; total 100; CTA "Approve & fund"; editing a weight clears approval |
| A7 | `/` (Home) | Redirects to `/welcome` with no wallet; with wallet shows balance, agents, SOL row |
| A8 | `/markets` | 5 class pills; commodities SIMULATED-tagged; crypto shows live prices |
| A9 | `/bot` | Agent header; either a proposal card with a LIVE countdown, or a decline message. Never blank |
| A10 | `/strategies` | Running/Add new; ladder tiers 1–7 with tier 1 available |
| A11 | `/holdings` | Portfolio value, allocation bar, holdings from real positions, wallet address |
| A12 | `/activity` | Filter pills; rows from the executor audit log; export button |
| A13 | `/history` | On-chain settlements read from The Graph, each with a tx hash |
| A14 | `/safety` | LIVE/STOPPED chip; 3 consequence cards; kill button |
| A15 | `/swap` | Live price; real 1inch route naming venues; price impact |
| A16 | `/order/:sym` | Keypad; unit conversion from LIVE price; fee row; CTA |
| A17 | `/briefing` | Real RSS headlines with agent takes |
| A18 | `/settings` | Wallet, delegation status, tone dial, legal links |
| A19 | `/search` | Filters across all 5 classes; empty state for no match |
| A20 | Edge: unknown route | Renders a not-found, not a crash |

## E — Executor API

| # | Endpoint | Correct means |
|---|---|---|
| E1 | `GET /health` | 200 without auth; reports db, chain, contract |
| E2 | Any other route, no token | 401 `unauthorized` |
| E3 | Any route, forged JWT | 401 — signature actually verified |
| E4 | `GET /agent/decision` | Graph-derived decision with rationale |
| E5 | `GET /graph/health` | Indexer block + healthy flag |
| E6 | `GET /swap/quote` | 1inch route, venues, minimumOut, price impact |
| E7 | `POST /strategies` over cap | 400 `over_cap` with the arithmetic in the message |
| E8 | Edge: bad JSON body | 4xx, never a 500 |

## C — Contracts (Base Sepolia + Aqua fork)

| # | Item | Correct means |
|---|---|---|
| C1 | XorrDelegation deployed | Code at the address on public Base Sepolia |
| C2 | Grant | `policyOf` returns delegate/cap/expiry; 1inch router allowlisted, others not |
| C3 | Delegated spend | Balances move; `spentToday` increases; `remainingToday` decreases |
| C4 | Over-cap spend | Reverts `DailyCapExceeded`; balance unchanged |
| C5 | Unlisted venue | Reverts `VenueNotAllowed` |
| C6 | Non-delegate caller | Reverts `NotDelegate` |
| C7 | Aqua ship moves no tokens | Maker/app/Aqua balances unchanged; virtual balances set |
| C8 | Aqua taker swap | Real ERC-20 movement both legs |
| C9 | Aqua oracle band | Out-of-band quote AND swap both revert |
| C10 | Aqua dock without operator | Maker exits with no bot involvement, even after revoke |

## G — Subgraph

| # | Item | Correct means |
|---|---|---|
| G1 | Synced | `_meta.hasIndexingErrors == false`, block > deploy block |
| G2 | Policy indexed | Matches the on-chain `policyOf` exactly |
| G3 | Spend indexed | txHash matches a real transaction |
| G4 | Daily rollup | Per-UTC-day totals matching the contract's cap window |
| G5 | Unknown address | Returns null rather than inventing a policy |
