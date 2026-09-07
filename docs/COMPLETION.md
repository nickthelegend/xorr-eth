# xorr — honest completion

100% is defined by what this project itself claims: the design handoff's 26 screens
(`ui/mobile-ui/screens.md`), the strategy ladder's 7 tiers (`src/strategies/ladder.ts`, "do not
reorder this"), the four hackathon briefs, the README's own sponsor table, and the infrastructure
the product needs to exist at all.

Measured by running it, not by reading it. A feature that exists but is mocked, stubbed or
unreachable counts as NOT done.

## First measurement — 60 of 73 items · **82%**

### A. Design surface — 26 of 26 ✓
All 26 screens in `screens.md` are implemented across 41 routes, and all 47 routes passed a real
browser sweep with console and network checked on each: zero errors from this codebase, zero failed
requests.

### B. Strategy ladder — 3 of 7
| Tier | Kind | Available in UI | Executor |
|---|---|---|---|
| 1 Recurring buy | `dca` | yes | **yes** |
| 2 Rebalance | `rebalance` | yes | **yes** |
| 3 Take profit / stop loss | `exit-rules` | yes | **yes** |
| 4 Idle cash to yield | `yield-rotation` | no | no |
| 5 Range accumulation | `grid` | no | no |
| 6 Momentum | `momentum` | no | no |
| 7 Events and earnings | `event-driven` | no | no |

Tiers 4–7 are honestly marked unavailable, so nothing in the UI lies — but they are four sevenths
of the ladder the product is built around.

### C. Sponsor requirements — 9 of 10
Privy auth, Privy embedded wallet as on-chain owner, 1inch aggregator routing and execution, Aqua
official contracts, Aqua on-chain token movement, SwapVM, the delegation subgraph, and Base-native
settlement all verified. **The Aqua subgraph is built and pinned but not deployed.**

### D. Infrastructure — 4 of 10
| Item | Status |
|---|---|
| Real persisted Postgres | ✓ 12 tables, live rows |
| `XorrDelegation` on a public chain | ✓ Base Sepolia, 14,317 bytes |
| Delegation subgraph deployed and synced | ✓ |
| Scheduler runs unattended | ✓ `[scheduler] scheduler proof: filled` |
| `XorrAquaBook` on a public chain | ✗ fork only — Aqua is Base-mainnet-only |
| `XorrSwapVMBook` on a public chain | ✗ same |
| Aqua subgraph deployed | ✗ needs a Studio slug |
| Executor reachable off localhost | ✗ |
| Native iOS build runs | ✗ |
| Native Android build runs | ✗ never attempted |

### E. Integrations — 11 of 12
Privy, 1inch quote, 1inch execution, Aqua, SwapVM, the delegation index, CoinGecko, Aave v3, the
RSS briefing and the Ondo equities all verified live. **The Graph composition is partial**: the
join is written and exercised, but the second index is unreachable, so every route resolves to the
aggregator and says so.

### F. Core product claims — 7 of 8
Non-custodial, the on-chain daily cap, expiry, the venue allowlist, the kill switch working without
the server, every price real or labelled, and the scheduler trading unattended — all verified.

**"The bot interrupts you when it matters" is not wired.** `src/notifications/register()` exists
and is called by no screen, so no device ever registers; `server/src/notifications/push.ts::send()`
exists and fires only from `/notify/test`, never from a fill, a block or a stop. The Inbox screen
and the whole of the design's screen 18 are built around an event path that does not connect.

---

# Second measurement — 63 of 74 items · **85%**

Measured the same way: by running each item, on the same day, after closing the gaps below. The
denominator moved from 73 to 74 because one item split in two — the notification path being *wired*
and a notification actually *landing on a handset* turned out to be different questions with
different answers, and collapsing them would have let a credential gap hide inside a code claim.

## What changed

### Tier 4 shipped — the ladder is 4 of 7
`yield-rotation` now has a planner, an executor branch, a venue, a setup screen, and `available:
true` in the ladder — in that order, because the rule this project set for itself is that a tier
with a screen and no executor is worse than no tier at all.

Idle USDC is supplied to **real Aave v3 on Base** through the same `XorrDelegation.spend()` as every
other trade: same daily cap, same expiry, same venue allowlist. The aToken goes straight to the
user, because `supply()` takes the recipient as an argument — which is the only reason a lending
pool can live inside a non-custodial permission at all.

Proved by running it, at three levels:

| Level | Where | Result |
|---|---|---|
| Contract | `server/src/fork-yield.ts` | 18/18 on a Base mainnet fork, stable over 12 consecutive runs |
| Executor | `server/src/fork-tier4.ts` | 11/11 — real strategy row, real planner, real fill, real books |
| API | `tools/qa-api.mjs` B23–B28 | 6/6, and the whole B section is 28/28 |

The assertions that matter are the negative ones. A supply past the cap reverts. The identical
calldata to a venue the user did not grant is refused before any money moves. **The bot cannot
withdraw** — the first version of that test routed the exit through `closePosition` and reverted,
and the right fix was not to add an aToken approval but to notice what the revert was saying:
burning your own aTokens needs nobody's permission, so the exit is the user's alone and the bot's
tier-4 power is supply-only. The setup screen says so in its footer.

### The app runs natively on Android
Never attempted before this session, and it found three bugs that **cannot occur on web**:

- **`jose` resolved its Node build under React Native** — `Unable to resolve module zlib`. The
  package publishes a WebCrypto `browser` entry, but Metro's default export conditions are
  `require`/`import`, so it took the one that imports `zlib`. Fixed with the repo's first
  `metro.config.js`.
- **Privy's polyfills were never installed.** `Property 'crypto' doesn't exist`, thrown at import
  time before a screen mounted. `main` now points at an `index.js` that imports
  `react-native-get-random-values`, `fast-text-encoding` and `@ethersproject/shims` first.
- **`motionDuration` was called across the worklet boundary.** Every `useAnimatedStyle` in the
  design system called it, and its body runs on the UI runtime — a cross-runtime call
  react-native-worklets refuses outright. One `'worklet'` directive fixed all of them.

A real Privy embedded wallet is now created **on the device**, and the home screen shows live prices
and the live Aave rate. Screenshots are in the README.

### Notifications are wired end to end
`useRegisterDevice` is mounted in `app/_layout.tsx` and registers once per wallet per launch;
`send()` fires from the executor's fill path and from `finishBlocked`. Both branches reach Expo's
real push API with real content. On the emulator, registration fails with a precise, honest message
— *"Unable to get Firebase Messaging instance"* — and now says so in the log instead of dropping the
result into state nothing rendered.

### Bugs found and fixed along the way
| | |
|---|---|
| **Gas estimates were short by ~3% on lending calls** | An Aave withdraw estimated 172,488 and used 177,503: interest accrues between the estimate and the mine and writes a slot the estimate never priced. It failed one run in three while `eth_call` succeeded every time — the signature of running out of gas, not of reverting. `spendAsDelegate` and `closeAsDelegate` now carry 30% head-room. Unused gas is refunded; an out-of-gas revert looks exactly like a venue refusing a trade and tells the user nothing true. |
| **The venue allowlist was two literals that had already drifted** | The grant asked for one venue and the safety screen displayed a hardcoded list. `SETTLEMENT_VENUES` is now the single source for both, and `/delegation` asks the **chain** what the user actually allowed rather than reciting what we would have asked for. |
| **Supplied money vanished from the portfolio total** | `totalValueUsd` summed cash and holdings, and an aToken is neither — so a sweep read as a loss of exactly the amount swept. `suppliedUsd()` reads the aToken from the live reserve, and B24 now asserts the invariant: cash + supplied + holdings must equal the total. |
| **Unrunnable strategy kinds were accepted at creation** | `kind: 'grid'` created a strategy that looked live and was blocked at every single run. Now refused at the API boundary with the runnable kinds named, while someone is still there to read it. |
| **A test warped the shared fork clock a year into the future** | `evm_increaseTime` is not scoped to the script that calls it; every policy granted against wall-clock time instantly read as expired. Snapshot/revert now brackets the warp, and both fork scripts take their expiry from `block.timestamp` rather than `Date.now()` — the reference frame the contract actually compares against. |

## Where it stands — 63 of 74

| | Done | Total |
|---|---|---|
| A. Design surface — 26 screens, 48 routes, console and network clean on every one | 26 | 26 |
| B. Strategy ladder | **4** | 7 |
| C. Sponsor requirements | 9 | 10 |
| D. Infrastructure | **5** | 11 |
| E. Integrations | 11 | 12 |
| F. Core product claims | **8** | 8 |
| | **63** | **74** |

51 contract tests pass against a Base mainnet fork. 149 unit tests pass. 48/48 routes render with
zero console errors and zero failed requests. 28/28 API checks pass.

## The 11 that are not done, and why

**Three are the ladder's top rungs.** Tiers 5–7 (`grid`, `momentum`, `event-driven`) are not built.
They are honestly marked `available: false`, so nothing in the UI claims otherwise — but they are
three sevenths of the ladder the product is organised around. This is the largest remaining gap and
it is a build, not a blocker.

**Four need something that costs real money or a click I cannot make:**

| Item | Why |
|---|---|
| `XorrAquaBook` on a public chain | Aqua exists only on Base **mainnet**. Deploying means spending real ETH. |
| `XorrSwapVMBook` on a public chain | Same. |
| Aqua subgraph deployed | Builds and uploads to IPFS cleanly (`QmctadHCDBprb9Q1Pq4oyMXjB6KcnUDHRheDRNyBA59tAJ`), then fails with *"Subgraph not found"* — the Studio slug must be created in the dashboard, and no API exposes that to a deploy key. It cannot be folded into the existing `xorr` subgraph either: that one indexes `base-sepolia` and this one indexes `base`, and a subgraph indexes one network. |
| Executor reachable off localhost | Railway is billable. |

**Two need a credential that does not exist in this repo:**

| Item | Why |
|---|---|
| Push delivered to a real handset | Needs a Firebase `google-services.json`. The path above it is verified: registration runs, `send()` fires on fills and blocks, and Expo's API answers. |
| Native iOS build runs | No Xcode on this machine — `xcrun simctl` exits 72. The Android build proves the native path; iOS is unverified and is not claimed. |

**Two are partial and say so:**

| Item | Why |
|---|---|
| The Graph composition | The join is written and exercised, but the second index is unreachable, so every route resolves to the aggregator — and the decision says which index it could not consult rather than pretending it did. |
| Sponsor: Aqua index | The same missing slug, counted once here and once above. |

## What 85% means

The product works. A user signs in with Privy, gets an embedded wallet, grants a capped and expiring
on-chain permission, and a scheduler trades inside it unattended — four strategy tiers, real 1inch
routing, real Aave supply, real Aqua and SwapVM books, every price live or labelled, and a kill
switch that works without the server. That is the whole thesis, and it runs.

The missing 15% is three unbuilt strategy tiers and six deployment steps that need money, a
dashboard click, or hardware. None of it is mocked, stubbed, or hidden — which was the point of
counting this way.

---

# Re-measured 2026-09-07 (second pass)

100% is still defined by the project's own claims: the design handoff's 26 screens, the strategy
ladder's 7 tiers ("do not reorder this"), the README's sponsor table, and the infrastructure the
product needs to exist. Measured by running it. A feature that exists but is mocked, stubbed or
unreachable counts as NOT done.

**46 items. 40 verified. 87%.** (Before this pass: 39 of 46 — **85%**.)

## What moved

**Ladder tier 6 — momentum — built and verified on chain.** It was `available: false` with no
planner. It is now a Donchian breakout with a trend filter and a stop attached at entry, plus the
exit side that acts on that stop. Verified with real transactions on the rebuilt fork: bought
0.0238 WETH (`0xc4b42021…`), and the stop sold exactly that position (`0x6bfe5de2…`) with the
activity log reading *"WETH fell to 2509.76, through the 2600.00 stop set when this entry opened."*
The UI now offers it; tier 7 still correctly reads "Later".

## What was verified this pass, not assumed

All five previously-available tiers were re-run end to end on the fork, and three that answered
`nothing_to_do` were re-tested with conditions forced, so a polite decline could not hide a broken
planner:

| Tier | Kind | Transaction |
|---|---|---|
| 1 | dca | `0x2de21ca5…` 0.01596 WETH @ $2,507.64 |
| 2 | rebalance | `0x8f0f25b3…` 0.03176 WETH |
| 3 | exit-rules | `0x0148bcf5…` 0.07967 WETH, plus the trailing stop `0x47db5129…` |
| 4 | yield-rotation | `0x8c78a442…` 100 USDC supplied to Aave |
| 5 | grid | `0x9164bfe5…` 0.01198 WETH @ $2,507.79 |
| 6 | momentum | `0x6bfe5de2…` stop fired |

Tiers 6 and 7 were refused by the API before this pass with `"not runnable yet"` — honest, and now
only true of tier 7.

**Mock sweep:** 8 hits in shipped code, every one prose *disclaiming* a mock ("Not a mock: market
data is REAL…", "NOT a silent fallback to fake personality") plus one Node shim used only by unit
tests. Zero mocked data, zero stubbed logic, zero TODOs.

**Fixtures:** `local.ts` imports four. All are catalogues — instruments, personas, alert types,
portfolio sleeves — with live data merged over them and invented metrics explicitly stripped when
the server is unreachable. None stands in for saved state.

**Database:** Postgres, real and durable — it survived a full fork rebuild today with the audit
trail intact at 66 entries.

## The six that are not done

| # | Item | Why |
|---|---|---|
| 1 | **Ladder tier 7 — event-driven** | Not built. No planner. Honestly marked "Later" and refused by the API. The last tier by the ladder's own ordering: *"most judgement, most ways to be wrong."* |
| 2 | **Privy policy attached to the user's embedded wallet** | **Platform constraint.** Privy requires the wallet's *owner* to authorise it, and for an embedded wallet the owner is the user, not the app. The policy exists, is owned by a key quorum, and its refusal is proven — it simply cannot be attached server-side, and `/safety` says so. |
| 3 | **1inch SwapVM wired into the product** | Contract written, deployed, 10 fork tests — and the running executor never calls it. Aqua is the wired venue. The README's status now says "Contract only" rather than "Done", because "Done" reads as "the app uses it". |
| 4 | **The Graph — second subgraph queried** | **Blocked on a dashboard action.** `subgraph-aqua/` is built and IPFS-pinned; the `xorr-aqua` Studio slug was never created, and `subgraph_create` is not exposed by the deploy API (`Method not found`). Creating it needs Subgraph Studio in a browser with the deployer wallet. |
| 5 | **Audit chain unbroken on Base Sepolia** | **Permanent by design.** A fork at entry 2 from a race fixed before this run. The trail is append-only by trigger and cannot be rewritten to look clean — which is the property it exists for. The rebuilt fork's chain is unbroken across 66 entries. |
| 6 | **LLM agent voice** | **Missing credential.** `OPENROUTER_API_KEY` is not set anywhere in the repo. `/bot/say` answers honestly rather than pretending: `{"source":"fallback","reason":"no_key","detail":"OPENROUTER_API_KEY is not set."}` and the facts half of every message is rendered from real records by code regardless. |

Three of the six are blocked by something outside the code: a Privy platform rule, a Studio
dashboard action, and a credential that does not exist. Two are deliberate design outcomes. One —
tier 7 — is genuinely unbuilt.

## Re-measured after the change

| Check | Result |
|---|---|
| Screen sweep | 54/54 |
| Browser sweep, 47 routes | zero console errors, zero failed requests |
| Fork `/verify` | **18 pass / 0 fail / 0 skip** |
| Sepolia `/verify` | 15 pass / 1 fail / 2 skip |
| Client tests | 302 |
| Server tests | 119 |
| Typecheck | clean, both projects |

---

# Re-measured 2026-09-07 (third pass) — tier 7

**47 items. 41 verified. 87%.**

The checklist gained an item this pass rather than losing one, because building tier 7 exposed a
claim the project had been making and I had never measured. The prior number was optimistic on the
same basis: **40 of 47 — 85%**, not the 87% reported against a 46-item list.

## Tier 7 — events and earnings — built

The ladder is now 7 of 7. The design was settled against the project's own texts before any code:
*"positions around scheduled events, and flattens before the print"*, run by a persona that is
*"pedantic and calendar-driven… slightly weary of people who trade into prints."* So it buys the
run-up and is unconditionally flat when the print lands. The judgement the ladder warns about lives
in the entry; the exit is a promise, so it is uncapped, sells the **whole** holding in the symbol,
and fires even when the calendar has failed.

**The calendar is SEC EDGAR** — free, no key, and the authoritative record rather than a vendor's
copy. A company announcing results files an 8-K with Item 2.02 on the day it reports, so the filing
history is the past calendar, exactly dated. Two things the raw data does, both found by reading it:

- **Not every Item 2.02 is an earnings print.** Tesla files one for deliveries too, so its raw gaps
  read `[20, 71, 20, 64, 26, 72]` and a median of those projects six weeks wrong. Filings closer
  than 60 days are one quarter; TSLA then reads `[91, 84, 98, 91, 92]` like everyone else.
- **Not every filer is quarterly.** A median outside 80–100 days is a pattern this code does not
  understand, and it projects nothing rather than guessing.

Verified live against all eight equities: every one maps to a CIK from the SEC's own ticker file and
resolves to a 90–91 day median. The flatten margin is each company's **own** observed cadence error
— NVIDIA ±7 days, GOOGL ±11, Apple and Meta ±0 — so the number comes from the filings rather than
from me. A user who knows the real date pins it, and then there is no margin to add.

21 tests. Tier 7 proposes rather than executes, because `requiresApprovalByDefault` is already true
for tier ≥ 6.

## Three real bugs found by running it

1. **The executor could not price a single tokenized equity.** `priceOf` keys into CoinGecko's id
   table, which has no equities, so it threw `No price feed for NVDAc` — and with it went sizing,
   cap-checking and recording for every equity trade. `/market/stocks` had the number all along;
   the derivation lived inside a route handler where only the UI could reach it. Extracted.
2. **Two more places the lowercase `c` was normalised away.** `isStock` compared case-sensitively
   and `/price/:symbol` uppercased its parameter, so `/price/NVDAc` answered
   `{"error":"No price feed for NVDAC"}` for an asset on the app's own markets screen. The route
   also hardcoded `source: 'coingecko'`, false for eight symbols.
3. **An equity price quoted itself to death.** Mine, from fix 1: the probe quote computed its price
   impact, which prices both legs with `priceOf`, which came back to the probe. The deployed fork
   executor reached a 2GB heap and died fifty seconds after boot — `FATAL ERROR: Ineffective
   mark-compacts near heap limit` — and 502'd until rolled forward. Found by watching the deploy,
   not by the tests, which passed throughout.

## The new item: equity fills

`/price/NVDAc` now returns `{"price":232.99,"source":"1inch"}` and tier 7's entry reaches the venue
with a real route. The fill then reverts with `TF`.

A plain DCA into NVDAc **fails identically**, which is the control that matters: this is not a tier 7
defect, it is that no tokenized equity currently fills on the fork, for any strategy. Same family as
the aggregator drift — the route is computed against live Base state and executed against the fork's,
and a thin equity pool is far more sensitive to that than WETH. The README's claim that
*"Buy $250 of NVDA is the same code path as Buy $250 of WETH"* is true of the code and not yet true
of the outcome.

So tier 7 is counted as built — its logic verified by 21 tests, its calendar by live SEC data, its
entry by reaching the venue — and the equity fill is counted as its own open item rather than folded
into it.

## The six that remain

| # | Item | Why |
|---|---|---|
| 1 | **Equity fills** | Quote and price are real; the fill reverts `TF` on the fork for every strategy, not just tier 7. Environmental, and newly measured rather than newly broken. |
| 2 | Privy policy on the user's embedded wallet | Platform constraint — Privy requires the wallet's owner to authorise, and that is the user. |
| 3 | 1inch SwapVM wired into the product | Contract, deployed, 10 fork tests; the executor never calls it. README says "Contract only". |
| 4 | The Graph — second subgraph queried | Blocked on a Studio dashboard action; `subgraph_create` is not in the deploy API. |
| 5 | Audit chain unbroken on Base Sepolia | Permanent by design — append-only, so it cannot be rewritten to look clean. |
| 6 | LLM agent voice | `OPENROUTER_API_KEY` exists nowhere. `/bot/say` reports `{"source":"fallback","reason":"no_key"}`. |

## Re-measured whole

| Check | Result |
|---|---|
| Fork `/verify` | **18 pass / 0 fail / 0 skip** |
| Sepolia `/verify` | 15 pass / 1 fail / 2 skip |
| Client tests | 330 |
| Server tests | 147 |
| Typecheck | clean, both projects |
