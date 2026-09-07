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
| 1.1 | Add `BASE_ELFOMOFI` to `FORK_AMMS` in `server/src/venues/oneinch.ts:270`. Re-run a `dca` into `NVDAc` on the fork and require a filled status with a tx hash. | **NOT STARTED** |
| 1.2 | If 1.1 alone does not fill, widen `FORK_AMMS` to the full protocol list from `/liquidity-sources` **minus** the private-market-maker sources that a fork cannot reproduce (the reason the allowlist exists — see the docblock at `oneinch.ts:259`). Name the excluded ones and why. | **NOT STARTED** |
| 1.3 | Make `quote()` and `buildSwap()` ask the **same** question. Today a fork quotes a price it structurally cannot fill, which is a lie by construction for any token whose best route is outside the allowlist. Either apply `AMM_ONLY` to `quote()` too, or drop it from `buildSwap()` — but they must agree. | **NOT STARTED** |
| 1.4 | Add `TF` to the selector/reason table in `server/src/executor/failure.ts`. It is currently unhandled, so a user sees "the transaction did not go through" for a routing failure that has a specific cause. | **NOT STARTED** |
| 1.5 | Add a live test `server/src/equity-fill.live.test.ts` that buys and sells one tokenized equity end to end on the fork, asserting a tx hash and a balance change — the same shape as `live-aqua.ts`. | **NOT STARTED** |
| 1.6 | Verify the equity **sell** path separately. `closePosition` pulls the asset being sold, and the approvals report shows every equity at allowance `0` — confirm the grant's `approvableTokens()` actually includes equities on a fork build, and that a sell is not silently blocked. | **NOT STARTED** |
| 1.7 | Once fills work, re-run tier 7's entry and flatten on `NVDAc` and record both tx hashes in `docs/COMPLETION.md`. | **BLOCKED** by 1.1 |

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
| 3.1 | Canonicalise **inside** `quote()` and `buildSwap()` — `oneinch.ts:183-184` and `333-334` do raw `TOKENS[params.inSymbol]` lookups. Then no caller can get it wrong. | **NOT STARTED** |
| 3.2 | `server/src/executor/run.ts:388` — `TOKENS[strategy.symbol === 'ETH' ? 'WETH' : strategy.symbol]` is a raw lookup on a stored value. Route through `canonicalSymbol`. | **NOT STARTED** |
| 3.3 | `server/src/market/crosscheck.ts:82` — `TOKENS[symbol] ?? TOKENS[symbol.toUpperCase()]`. The fallback uppercases, so it can never resolve an equity. Replace with `canonicalSymbol`. | **NOT STARTED** |
| 3.4 | `server/src/market/perp.ts:42` uppercases then keys `COINGECKO_IDS`, so an equity silently returns null rather than saying it has no perp. Make the refusal explicit. | **NOT STARTED** |
| 3.5 | `server/src/fork-e2e.ts:92` — `TOKENS[SYMBOL] ?? STOCKS[SYMBOL]`, both raw. | **NOT STARTED** |
| 3.6 | Add a test that walks **every** registered symbol through every public entry point (`/price/:symbol`, `/swap/quote`, `POST /orders`, `POST /strategies`, `/market/crosscheck`, `/perp/:symbol`) in three casings and asserts none 404s or misroutes. The existing `symbols.test.ts` covers the registry; this covers the boundaries. | **NOT STARTED** |
| 3.7 | Decide and document the rule in one place: **crypto symbols are uppercase, equities carry a lowercase `c`, and no boundary may uppercase a caller's symbol.** Put it next to `canonicalSymbol` so the next person does not re-derive it. | **NOT STARTED** |
| — | `canonicalSymbol` exists and is applied at `/swap/quote`, `POST /orders`, `POST /strategies`, panic-flatten and `/price/:symbol`. | **DONE** |
| — | `stockKey` resolves the stocks registry case-insensitively. | **DONE** |

---

## Phase 4 — Executor hardening

`server/src/executor/run.ts` is 950 lines and moves real money. It is careful in the places that
have already failed and thin in the places that have not yet.

| # | Task | Status |
|---|---|---|
| 4.1 | **No retry on a transient venue failure.** A run that fails on a reverted fill is terminal for that period, and because `period_key` is unique it can never be retried — a user silently loses that day's buy to a transient RPC or routing hiccup. Add a bounded retry inside the run, distinguishing "the venue said no" (do not retry) from "the call did not complete" (retry). | **NOT STARTED** |
| 4.2 | **Slippage is two constants.** `SLIPPAGE.scheduled` / `SLIPPAGE.stop` are fixed. A thin equity pool needs more room than WETH, and the failure mode of getting it wrong is `ReturnAmountIsNotEnough`. Derive it from the quote's own `priceImpactPct`, with the constants as a floor. | **NOT STARTED** |
| 4.3 | **Simulate before spending gas.** `eth_call` the `spend` before sending it, so a revert is reported without a failed transaction on chain and without consuming the period claim. This alone would have turned every `TF` failure this week into a clean, explained skip. | **NOT STARTED** |
| 4.4 | **Pending runs are never reconciled.** A run interrupted between claim and completion stays `pending` forever (observed once this week). Add a startup sweep that reconciles rows older than N minutes against the chain. | **NOT STARTED** |
| 4.5 | Split `run.ts`. The planning, the policy gate, the venue selection and the settlement are four concerns in one file; the venue selection alone (Aqua vs SwapVM vs aggregator) is about to grow. | **NOT STARTED** |
| 4.6 | Wire `XorrSwapVMBook` into the executor, mirroring `venues/aqua.ts`. It is deployed and has 10 fork tests, and the running executor never calls it — the README now says "Contract only". Needs a discovery path for shipped programs (`ProgramShipped` logs → `orderFor` → `delegatedFillArgs`). | **NOT STARTED** |
| — | Idempotent runs: `strategy_runs.period_key` unique, claim-by-insert. | **DONE** |
| — | Graceful shutdown drains in-flight runs on SIGTERM. | **DONE** |
| — | Cap exemption is decided per intent, not per kind (`reducesRiskOnly`), covering both dual-sided tiers. | **DONE** |
| — | Receipts awaited for every leg, including `direct`. | **DONE** |
| — | Venue reverts humanised by selector, including all three `ReturnAmountIsNotEnough` arities. | **DONE** |

---

## Phase 5 — Backend structure and ops

| # | Task | Status |
|---|---|---|
| 5.1 | **No rate limiting.** `server/src/index.ts` has request-id, CORS, idempotency and auth, and nothing bounds request volume. One agent key or one loop can exhaust the 1inch and CoinGecko quotas for every user. | **NOT STARTED** |
| 5.2 | Split `server/src/routes/index.ts` (1097 lines) along the seams it already has: wallet, delegation, strategies, positions, pnl. | **NOT STARTED** |
| 5.3 | Structured logging. `log()` exists in `http/request-id.ts`; use it consistently instead of bare `console.error`, so a failed run can be traced by request id. | **NOT STARTED** |
| 5.4 | Add `/metrics` counters for the things that now matter: fills by venue, failures by selector, cache warmth, projection staleness. | **NOT STARTED** |
| 5.5 | Migration `010` for anything Phase 1–4 adds; keep the numbered-file convention. | **NOT STARTED** |
| — | Real persisted Postgres; survived a full fork rebuild with the audit trail intact at 66 entries. | **DONE** |
| — | Hash-chained append-only audit log with a per-wallet advisory lock and a unique index. | **DONE** |
| — | Scoped agent keys (`read` / `trade:open` / `trade:close` / `admin`), sha256-only, revocable; `admin` does not imply trade scopes. | **DONE** |
| — | Periodic price-cache re-warm with a separate staleness tolerance for history. | **DONE** |
| — | Single-flight upstream fetches; no stampede on a cold cache. | **DONE** |

---

## Phase 6 — Verification and proof

| # | Task | Status |
|---|---|---|
| 6.1 | Add a `/verify` check that a tokenized equity can actually be **filled**, not merely priced. The current `equities` check asserts the contracts have code, which passed throughout the week fills were broken. | **NOT STARTED** |
| 6.2 | Add a `/verify` check that the second Graph source is live, so the composability claim is checkable rather than asserted. | **BLOCKED** by 2.2/2.3 |
| 6.3 | Add a `/verify` check for the earnings calendar: it should report the next projected date and its margin for one symbol, proving tier 7's data source is live. | **NOT STARTED** |
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
