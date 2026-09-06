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
