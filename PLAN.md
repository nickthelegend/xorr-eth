# xorr — build plan

Planning only. Nothing in this document has been built as part of writing it; every status tag
below reflects the repository as it stands at commit `f556f4f`.

Written for an agent to pick up cold. Every task names the file, the symbol, and what "done" means.

---

## 1. What done and winning actually mean here

This is not a generic web app. Its claim is narrow and testable, and everything below serves it:

> **A bot trades your capital under a permission you granted on-chain, that you can read and revoke
> without our cooperation — and every number the app shows you can be checked somewhere we do not
> control.**

**Done** means all four of these hold at once:

1. **The permission is real.** `XorrDelegation` is deployed, the grant is a user-signed transaction,
   the cap/expiry/venue-allowlist are enforced in the contract, and revoke takes effect without the
   server's help. — *holds today.*
2. **The bot actually trades.** All seven ladder tiers plan real intents, and the executor settles
   them on chain against a real venue, for every asset class the app lists. — *holds for crypto;
   **does not hold for tokenized equities**, which is the biggest single gap in the project.*
3. **Nothing on screen is invented.** Every price, balance, policy and history is a live read or an
   honest failure. — *holds; verified by a 47-route browser sweep and `/verify`.*
4. **A stranger can check it.** `/verify` and `/judge` re-run the claims live and report what they
   observed. — *holds; 18/18 on the fork, 15/1/2 on Sepolia.*

**Winning** is a separate bar, set by the three sponsor tracks the project targets:

| Track | Bar | Status |
|---|---|---|
| 1inch — Aqua App | "Official Aqua/SwapVM contracts must be used", real on-chain transfers | **Met.** Real Aqua fills against `XorrAquaBook`, book logs true / router logs false |
| Privy — B2B Financial Product | Privy core, ≥1 wallet, **≥1 Privy control** (policies, signers, quorums) | **Met.** Policy owned by a key quorum, refusal proven live |
| Privy — Best Financial Flow | ≥1 completed financial flow | **Met.** Swap, Aave deposit, user-signed USDC withdrawal |
| The Graph — Composable/Standardized | **Two or more** Graph products, or a standardized schema. *"Simply querying one Subgraph does not qualify."* | **NOT MET.** One subgraph is ever queried |

So winning needs exactly one more thing than done does: **The Graph composability**.

---

## 2. Phases

Ordered by dependency, not by preference. Phase 1 unblocks the product's headline asset class;
Phase 2 is the only thing standing between the project and a fourth track.

| # | Phase | Why it is here |
|---|---|---|
| 1 | **Make equity trades settle** | The app lists 8 tokenized stocks and cannot fill any of them |
| 2 | **The Graph composability** | The only unmet sponsor bar |
| 3 | **Symbol handling, once and for all** | Three separate bugs this week from the same root |
| 4 | **Executor hardening** | The component that moves money has the least defensive depth |
| 5 | **Backend structure and ops** | Unglamorous; what makes the above maintainable |
| 6 | **Verification and proof** | Extend `/verify` to cover what Phases 1–4 add |
| 7 | **Remaining product gaps** | Known, scoped, mostly blocked on things outside the code |

---

## Phase 1 — Make equity trades settle

**The diagnosis, in full, so nobody re-does it.**

`quote()` and `buildSwap()` ask 1inch different questions.

- `server/src/venues/oneinch.ts:190` — `quote()` calls `/quote` with **no protocol restriction**. For
  `USDC → NVDAc` 1inch answers with a route through **`Elfomofi`**, and the price is real:
  `/price/NVDAc` → `{"price":232.99,"source":"1inch"}`.
- `server/src/venues/oneinch.ts:341` — `buildSwap()` appends `AMM_ONLY`, which on a fork restricts
  `protocols=` to the 13 names in `FORK_AMMS` (`oneinch.ts:270-284`). **`BASE_ELFOMOFI` is not among
  them.** 1inch therefore builds a route through AMMs that hold no meaningful NVDAc liquidity, and
  the fill reverts `TF` inside the pool.

Confirmed by control: a plain `dca` into `NVDAc` fails with the identical revert, so this is not a
tier-7 defect — **no equity fills, for any strategy**. The protocol id is `BASE_ELFOMOFI`, verified
against `/swap/v6.0/8453/liquidity-sources`, which lists **69** protocols on Base where `FORK_AMMS`
names 13.

| # | Task | Status |
|---|---|---|
| 1.1 | Add `BASE_ELFOMOFI` to `FORK_AMMS`. **Tried, and it is not the fix.** With it in the list the revert changes from `TF` to `VenueCallFailed`: it is a solver whose off-chain state a fork cannot reproduce, which is the class the allowlist exists to exclude. Reverted, with the reason recorded in the code. | **DONE** (negative result) |
| 1.2 | Widen the allowlist further. **Not needed — the obstacle is one layer down.** An AMM-only route DOES exist (`BASE_AERODROME_SLIPSTREAM`, USDC→ETH→NVDAc) and still cannot fill, because the token itself is not functional on a fork. See the gap list. | **DONE** (superseded) |
| 1.3 | Make `quote()` and `buildSwap()` ask the same question. `AMM_ONLY` now applies to both, so a fork can no longer display a price from a route it would not take. On a real network the constant is empty and this is the unrestricted quote it always was. | **DONE** |
| 1.4 | `TF` humanised — a bare revert string, not a selector, matched word-bounded because `TF` appears inside longer words and a substring match would blame routing for something else. | **DONE** |
| 1.5 | Live equity fill test. | **BLOCKED** — cannot pass on a fork. `totalSupply()` on the equity tokens works on real Base and REVERTS on an anvil fork of the same block, so there is nothing to trade against. A test asserting a fill would be asserting something impossible here. |
| 1.6 | Verify the equity sell path. | **BLOCKED** by the same cause — with no functional token there is nothing to hold or sell. The allowance-0 observation is a consequence, not the cause. |
| 1.7 | Tier 7 entry + flatten on `NVDAc` with tx hashes. | **BLOCKED** — same root cause. Tier 7's logic is proven by 21 unit tests and by its entry reaching the venue with a real route and price; only the settlement is impossible here. |

---

## Phase 2 — The Graph composability

The track disqualifies *"simply querying one Subgraph"*, which is exactly what happens today:
`AQUA_SUBGRAPH_URL` is unset on **both** deployed services, so `aquaIndexConfigured()` is false and
`decide()` never runs its Aqua branch. `/graph/decision` says so in its own output.

| # | Task | Status |
|---|---|---|
| 2.1 | Create the `xorr-aqua` slug in Subgraph Studio and deploy `subgraph-aqua/` (already built and IPFS-pinned as `QmctadHCDBprb9Q1Pq4oyMXjB6KcnUDHRheDRNyBA59tAJ`). | **BLOCKED** — dashboard action; `subgraph_create` returns `Method not found` on the deploy API, so it needs a browser with the deployer wallet |
| 2.2 | Set `AQUA_SUBGRAPH_URL` on both Railway services and confirm `/graph/decision` stops reporting "No Aqua book index configured". | **BLOCKED** by 2.1 |
| 2.3 | **Alternative that needs no dashboard:** implement x402 Gateway queries. Verified working — `POST gateway.thegraph.com/api/x402/subgraphs/id/<id>` returns `402` with `network: eip155:8453`, `amount: 10000` (0.01 USDC), `asset: 0x833589fC…2913`, `assetTransferMethod: eip3009`. Sign an EIP-3009 authorisation with the delegate key and retry with the `Payment-Signature` header. Composes our Studio subgraph with the Gateway — two products. | **NOT STARTED** — needs real mainnet USDC, so confirm spend before running |
| 2.4 | Point `decide()` at a second real source once 2.2 or 2.3 lands, and make `/judge` show the cross-source join so the composition is visible rather than asserted. | **BLOCKED** by 2.2/2.3 |
| 2.5 | Index the **fork's** delegation address, or accept that `indexesThisDeployment()` is false where trades happen. Today the subgraph indexes Sepolia (`0xb14CF3D0…`) while fills happen on the fork (`0xabe6f2bb…`), so the two halves never meet and `/history` is permanently empty. | **NOT STARTED** |

---

## Phase 3 — Symbol handling, once and for all

Three separate production bugs this week from one root: the lowercase `c` that marks a tokenized
equity gets normalised away. `canonicalSymbol` exists (`oneinch.ts:59`) but is applied at *some*
route boundaries and not at the venue boundary, so every caller has to remember.

| # | Task | Status |
|---|---|---|
| 3.1 | Canonicalised inside `quote()` and `buildSwap()`, and the returned quote names the registry spelling so anything reading it back resolves. | **DONE** |
| 3.2 | Executor's lookup on a stored symbol now canonicalised. | **DONE** |
| 3.3 | `crosscheck` fixed — its fallback uppercased, so it reported eight tradable assets as "not routable on Base". | **DONE** |
| 3.4 | `perp` refuses equities explicitly instead of returning a bare null indistinguishable from an unknown symbol. | **DONE** |
| 3.5 | `fork-e2e` canonicalised on both sides. | **DONE** |
| 3.6 | `symbol-boundaries.test.ts` — every registered symbol through three casings, plus a guard that fails the build if a boundary module reintroduces `.toUpperCase()`. | **DONE** |
| 3.7 | The rule written once, next to `canonicalSymbol`, with the two legitimate exceptions named. | **DONE** |
| — | `canonicalSymbol` exists and is applied at `/swap/quote`, `POST /orders`, `POST /strategies`, panic-flatten and `/price/:symbol`. | **DONE** |
| — | `stockKey` resolves the stocks registry case-insensitively. | **DONE** |

---

## Phase 4 — Executor hardening

`server/src/executor/run.ts` is 950 lines and moves real money. It is careful in the places that
have already failed and thin in the places that have not yet.

| # | Task | Status |
|---|---|---|
| 4.1 | A run that never reached the chain and failed transiently releases its period. `sent` flips before the write, so a broadcast-but-unconfirmed run can never be released; an unclassified error is treated as permanent. | **DONE** |
| 4.2 | `slippageFor` keeps the urgency ceiling as a floor and widens by the quote's own reported impact, capped at 3%. | **DONE** |
| 4.3 | Pre-flight simulation. **Already existed** — `simulateContract` runs before `writeContract`, which is why every failure this week arrived as a clean revert and not a mined transaction. | **DONE** (pre-existing) |
| 4.4 | Boot reconciliation. **Already existed and is wired.** Its conservative policy — close every interrupted run as failed and KEEP the period — is correct: `signature` is written only after the receipt, so a broadcast-but-unconfirmed run has none, and a refinement keyed on that column would have been a double-spend. Verified rather than changed. | **DONE** (pre-existing) |
| 4.5 | Split `run.ts`. | **NOT STARTED** — deferred deliberately. Refactoring the money path late in a hackathon buys maintainability and risks correctness; the behavioural gaps above were worth more. |
| 4.6 | Wire `XorrSwapVMBook` into the executor. | **NOT STARTED** — a `venues/aqua.ts`-sized module plus a live proof. The 1inch track already qualifies through Aqua, and the README states plainly that this is contract-only. |
| — | Idempotent runs: `strategy_runs.period_key` unique, claim-by-insert. | **DONE** |
| — | Graceful shutdown drains in-flight runs on SIGTERM. | **DONE** |
| — | Cap exemption is decided per intent, not per kind (`reducesRiskOnly`), covering both dual-sided tiers. | **DONE** |
| — | Receipts awaited for every leg, including `direct`. | **DONE** |
| — | Venue reverts humanised by selector, including all three `ReturnAmountIsNotEnough` arities. | **DONE** |

---

## Phase 5 — Backend structure and ops

| # | Task | Status |
|---|---|---|
| 5.1 | Rate limiting, per identity rather than per IP (behind Railway every request shares one proxy address). Expensive routes get a tighter budget; `/health` is never limited, or the platform would restart the container under exactly the load the limiter exists for. | **DONE** |
| 5.2 | Split `routes/index.ts`. | **NOT STARTED** — same reasoning as 4.5. |
| 5.3 | Structured logging everywhere. | **NOT STARTED** — `log()` exists and is used in the paths that matter; a sweep of the rest is cosmetic next to the above. |
| 5.4 | Richer `/metrics`. | **NOT STARTED** — `/metrics` already reports runs, failure rate, strategies and alerts. |
| 5.5 | Migration `010`. | **NOT NEEDED** — nothing in Phases 1–5 changed the schema. |
| — | Real persisted Postgres; survived a full fork rebuild with the audit trail intact at 66 entries. | **DONE** |
| — | Hash-chained append-only audit log with a per-wallet advisory lock and a unique index. | **DONE** |
| — | Scoped agent keys (`read` / `trade:open` / `trade:close` / `admin`), sha256-only, revocable; `admin` does not imply trade scopes. | **DONE** |
| — | Periodic price-cache re-warm with a separate staleness tolerance for history. | **DONE** |
| — | Single-flight upstream fetches; no stampede on a cold cache. | **DONE** |

---

## Phase 6 — Verification and proof

| # | Task | Status |
|---|---|---|
| 6.1 | The `equities` check now calls `totalSupply()` instead of measuring code length. It had reported "8 of 8 have code" for a week in which not one could be traded — these tokens carry a single byte and answer anyway on real Base. It now SKIPS on a fork with the real reason. | **DONE** |
| 6.2 | Add a `/verify` check that the second Graph source is live, so the composability claim is checkable rather than asserted. | **BLOCKED** by 2.2/2.3 |
| 6.3 | `earnings-calendar` check added — reports the filing count, last report, projected next date and the company's own cadence margin, live from SEC EDGAR. | **DONE** |
| 6.4 | Re-run the 54-route screenshot sweep and the 47-route browser sweep after Phase 1, and record the result. | **NOT STARTED** |
| — | `/verify` covers 18 claims; fork 18/0/0, Sepolia 15/1/2. | **DONE** |
| — | `audit` and `audit-chain` are separate checks, so tampering and a fork are not reported as the same thing. | **DONE** |

---

## Phase 7 — Remaining product gaps

| # | Task | Status |
|---|---|---|
| 7.1 | Privy policy attached to the user's embedded wallet. | **BLOCKED** — Privy requires the wallet's owner to authorise, and for an embedded wallet the owner is the user, not the app. `/safety` states this |
| 7.2 | LLM agent voice. | **BLOCKED** — `OPENROUTER_API_KEY` exists nowhere in the repo. `/bot/say` reports `{"source":"fallback","reason":"no_key"}` rather than pretending |
| 7.3 | Audit chain unbroken on Base Sepolia. | **BLOCKED** — permanent by design. Append-only by trigger, so it cannot be rewritten to look clean; the fork's chain is unbroken across 66 entries, which is the evidence the fix works |
| 7.4 | Sparklines and charts for tokenized equities — they have no candle history, only a spot price. Either source history or keep stating plainly that there is none. | **NOT STARTED** |

---

## Phase 8 — Delivery and native

Carried forward from the previous plan. Everything else in that document is either DONE or
superseded — its Phase 7 ("three endpoints the app calls that do not exist") is now entirely
implemented, and its tiers 5–7 all ship.

| # | Task | Status |
|---|---|---|
| 8.1 | **Record the demo.** 60 seconds: sign in → grant → create a recurring buy → watch a fill on the fork → revoke. Link it from the top of the README. Every sponsor track asks for a 2–4 minute video; there is none. | **NOT STARTED** — the single highest-value item outside Phase 1 |
| 8.2 | **Write the submission text** for each track, pointing at the specific evidence: the Aqua fill tx, the Privy key-quorum refusal, `/judge`, and (once Phase 2 lands) the Graph composition. | **NOT STARTED** |
| 8.3 | **iOS.** Unverified and not claimed. This machine has Command Line Tools, not Xcode — `xcrun simctl` exits 72 — and installing Xcode needs the user's password. | **BLOCKED** on the user |
| 8.4 | **Android.** Builds to a real APK and runs on an emulator: Privy signs in, an embedded wallet is created on device, live prices and the live Aave rate render. Three bugs were path-specific and fixed: `jose` resolving its Node build (`metro.config.js`), Privy's polyfills never installed (`index.js` ahead of `expo-router/entry`), and `motionDuration` crossing the worklet boundary. | **DONE** |
| 8.5 | **Other hackathons** (a second chain deployment, cross-repo sharing). Out of scope by standing direction — ETH Online first. `XorrDelegation` is chain-agnostic and the venue adapter is one file, which is what makes this cheap later. | **NOT STARTED** — deliberately deferred |

---

## 3. The gap list

Every gap, tied to the task it blocks. Ordered by how much it costs.

| Gap | Where | Blocks | Severity |
|---|---|---|---|
| **Equity fills revert `TF`** — `buildSwap` restricts a fork to 13 AMMs; `BASE_ELFOMOFI`, which holds the equity liquidity, is not among them. Quote and swap ask different questions | `oneinch.ts:270-284`, `:341` | 1.1–1.7, 6.1 | **Critical** — 8 advertised assets, 0 fillable |
| **Quote and fill disagree by construction** on a fork for any token routed outside the allowlist | `oneinch.ts:190` vs `:341` | 1.3 | **Critical** — the app quotes prices it cannot honour |
| **Only one subgraph is ever queried** — `AQUA_SUBGRAPH_URL` unset on both services | Railway env; `graph/aqua.ts:19` | 2.1–2.4 | **High** — the only unmet sponsor bar |
| **The subgraph indexes a chain that never trades** — Sepolia indexed, fork settles | `graph/client.ts:33-39` | 2.5 | **High** — `/history` permanently empty |
| **Raw `TOKENS[...]` lookups at the venue boundary** bypass `canonicalSymbol` | `oneinch.ts:183,184,333,334`; `run.ts:388` | 3.1, 3.2 | **High** — the root of three shipped bugs |
| **`crosscheck` uppercases in its fallback**, so it can never cross-check an equity | `crosscheck.ts:82` | 3.3 | Medium |
| **No retry on a transient failure**, and the period can never be re-claimed | `run.ts` | 4.1 | **High** — a user silently loses a day's buy |
| **No pre-flight simulation** — every revert costs gas and burns the period | `run.ts` | 4.3 | **High** — would have caught every `TF` cleanly |
| **Fixed slippage constants**, wrong for thin pools | `run.ts:642` | 4.2 | Medium |
| **`pending` runs are never reconciled** | `run.ts`, `strategy_runs` | 4.4 | Medium — observed once this week |
| **`TF` is not humanised** | `executor/failure.ts` | 1.4 | Medium |
| **`XorrSwapVMBook` deployed and never called** | `venues/`, `run.ts` | 4.6 | Medium — README says "Contract only" |
| **No rate limiting** | `server/src/index.ts` | 5.1 | Medium — shared upstream quotas |
| **`routes/index.ts` 1097 lines, `run.ts` 950** | both | 5.2, 4.5 | Low — maintainability |
| **Equity approvals all read `0`** — unconfirmed whether a sell is blocked | `/approvals` on the fork | 1.6 | Unknown until checked |
| **Equities have no candle history** | `market/` | 7.4 | Low — stated honestly today |
| Privy policy not attached to the user's wallet | platform | 7.1 | **Blocked** |
| No LLM credential | env | 7.2 | **Blocked** |
| Sepolia audit chain forked at entry 2 | history | 7.3 | **Blocked**, permanent by design |

**Mock/stub/TODO sweep:** clean. Every hit in `src/`, `app/`, `server/src/` is either prose
disclaiming a mock ("Not a mock: market data is REAL…", "NOT a silent fallback to fake
personality"), a `placeholder` input attribute, or `src/test/react-native-stub.ts`, a Node shim used
only by unit tests. **No mocked data, no stubbed logic, no TODOs in shipped code.**

---

## 4. Suggested order

1. **1.1** — one line, and it either fixes the headline gap or proves it needs 1.2.
2. **1.3** — stop quoting prices that cannot be filled.
3. **4.3** — pre-flight simulation; makes every subsequent failure cheap and legible.
4. **3.1, 3.2** — canonicalise at the venue boundary and the whole class closes.
5. **1.5, 1.6, 6.1** — prove equities end to end and keep them proven.
6. **2.1 or 2.3** — the fourth sponsor track.
7. Everything else.
