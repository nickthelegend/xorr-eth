# xorr — build plan

Planning only. Nothing was built while writing this; every status was checked by running something
— a curl, a browser, a test suite — rather than by reading the previous plan.

Written for an agent to pick up cold: every task names the file, the symbol, and what done means.

**This is the fourth plan.** The third is in git history at `1332eab`; **86 commits** have landed
since. That changes the shape of this one completely. The third plan was written around two gaps —
a product lie about equities, and a missing demo — and both were closed. What replaced them is a
different class of problem entirely: the third plan measured the *code*, and the code was right.
This one is written after measuring the *deployed product as a stranger uses it*, which is where
twenty-two real defects were hiding, including a kill switch that worked on-chain while the screen
said it had not.

---

## 1. What done and winning mean here

The claim the whole project serves, unchanged:

> **A bot trades your capital under a permission you granted on-chain, that you can read and revoke
> without our cooperation — and every number the app shows you can be checked somewhere we do not
> control.**

**Done** means all six hold at once. Five do.

| # | Bar | State |
|---|---|---|
| 1 | The permission is real — deployed contract, user-signed grant, cap/expiry/venue enforced on chain, revoke needs nothing from us | **Holds.** Re-verified end to end this run: four signatures through Privy on Base Sepolia, then `/verify` reading `revoked=false, delegate matches` off the contract, then a kill switch giving `revoked=true, $0 left today` |
| 2 | The bot actually trades — all seven ladder tiers plan real intents and settle on chain | **Holds for crypto.** 33 filled runs on the fork, 35 through the 1inch aggregator and 5 through Aqua. **Does not hold for tokenized equities**, and the app now refuses them rather than offering |
| 3 | Nothing on screen is invented | **Holds.** Zero mocks, stubs, fakes or TODOs in shipped code — see the sweep in §4 |
| 4 | A stranger can check it — `/verify` and `/judge` re-run every claim live | **Holds.** Sepolia with an owner: **19 pass / 0 fail / 1 skip** |
| 5 | Someone can watch it work in two minutes | **Holds, but the recording is stale** — see Phase 1 |
| 6 | **A stranger can open it and complete the core flow themselves** | **Holds — new.** `https://web-production-3e214.up.railway.app`. This bar did not exist in the third plan, which is why nothing had ever tested it |

**Winning** is a separate bar set by the sponsor tracks:

| Track | Bar | State |
|---|---|---|
| 1inch — Aqua App | Official Aqua/SwapVM contracts, real on-chain transfers | **Met.** 5 real Aqua fills. SwapVM is wired into the settlement path with 10 contract tests but has **0 real fills** — see Gap G4 |
| Privy — B2B Financial Product | Privy core, ≥1 wallet, ≥1 Privy control | **Met.** Policy owned by key quorum `zixx49ik…`, refusal proven live: `"RPC request denied due to policy violation"` |
| Privy — Best Financial Flow | ≥1 completed financial flow | **Met.** Grant, revoke, swap, Aave supply, user-signed withdrawal |
| The Graph — Composable/Standardized | Two or more Graph products, or a standardized schema | **Not met.** One subgraph is ever queried. Unchanged since the third plan and blocked on the same dashboard click |

**The honest summary:** the software is finished and now *reachable*. Three of four tracks are met.
What is left is a stale demo, one dashboard click, and a short list of things that need a credential
or real money.

---

## 2. Phases

Ordered by what a judge would notice first, and by what is actually blocking.

| # | Phase | Why now |
|---|---|---|
| 1 | **Re-record the demo against the hosted app** | The existing recording predates 86 commits and points at localhost. It is the single highest-value unblocked task |
| 2 | **Close The Graph track** | The only unmet track; everything downstream of the slug is already written |
| 3 | **Make SwapVM a real fill, not a wired path** | The one sponsor claim resting on tests rather than a transaction |
| 4 | **Base mainnet** | Turns five bars into six and makes every integration real at once. Costs money |
| 5 | **Residue and hardening** | Real but low-severity: file size, a stale README count, a coverage hole the browser could not reach |
| 6 | **Blocked on an external thing** | Each names precisely what it waits on. None is a coding gap |

---

## Phase 1 — Re-record the demo against the hosted app

**The gap, measured.** `docs/demo/demo.mp4` is dated **Sep 8 07:11**; HEAD is a day and 86 commits
later. It was recorded by `tools/demo.mjs` driving `localhost`, at a time when no hosted build
existed. Since then the onboarding copy changed, `/judge`'s summary line changed, `/safety`'s badge
became chain-derived, the error surfaces across twenty screens changed, and a hosted URL appeared
that the video cannot show. A judge who watches it and then opens the link sees two different apps.

| # | Task | Status |
|---|---|---|
| 1.1 | Default changed to `https://web-production-3e214.up.railway.app`; `APP_URL` still overrides. The localhost fallback is what produced a recording nobody noticed was stale, so the committed script now records the shipped product unless told otherwise. | **DONE** |
| 1.2 | **No race exists, and no gas step is needed** — verified by running it. The recorder never signs: it walks screens and records footage to speak over, and the four Privy dialogs a grant raises are not something it drives. The drip still fires on a new wallet's first connect, so a *person* recording live is funded; the automated run does not depend on it. Recorded as a finding rather than a change. | **DONE — not needed** |
| 1.3 | Re-recorded three times — twice in the planning pass, once more in execution after the safety screen changed under it. **8 of 8 beats landed**, 91s, against the hosted app. The `/judge` beat carries a real FAIL on camera (`audit-chain` forks at entry 2, G12, permanent by design), so the rule holds. Frames extracted and read to confirm the footage is current, not assumed. | **DONE** |
| 1.4 | `demo.gif` (1.35MB) and `demo.mp4` (654KB) regenerated. Both README and `docs/SUBMISSION.md` corrected: they claimed the recording was made "against the running app on the Base mainnet fork", which is no longer true and was the more misleading half — it is the deployed app now, and the copy says so and links it. | **DONE** |
| 1.5 | Setup section rewritten for the hosted target, plus two things the old script got wrong: it told you to start a dev server, and beat 7 told you to tap a button the recorder does not tap. Beat 7 now carries a table of the three states the closing frame can land in and which to avoid. | **DONE** |

**Phase 1 had to be redone in execution, and doing so surfaced two more things.** The recording made
during planning closed on a green **Live** badge over a permission that had expired eighteen hours
earlier — it had recorded G14 without anyone noticing. And `tools/demo.mjs` read `PRIVY_APP_ID` from
an environment nothing populated, so a run without exported variables skipped the sign-in beat and
produced a video of the signed-out app: the empty state of every screen the demo exists to show
working, reported as one missed beat and otherwise indistinguishable from a good take.

**Phase 1 surfaced a defect the plan did not know about.** The closing frame of the first
re-recording showed a red **Stop all agents** on a wallet with no permission, directly beneath the
sentence "There is nothing to stop yet" — and pressing it would have asked the wallet to revoke a
policy that never existed. `killTitle` had taken a `granted` argument since a similar bug; `killCta`
had not. Fixed, tested (`src/state/derived.test.ts`), deployed and re-verified on the real screen:
the kill switch and its "takes effect in under a second" footnote are now absent when there is
nothing to stop, leaving the one action the permission card already offers. **G13** below.

## Phase 2 — Close The Graph track

Unchanged from the third plan and re-confirmed: `graph deploy xorr-aqua` uploads to IPFS
(`QmctadHCDBprb9Q1Pq4oyMXjB6KcnUDHRheDRNyBA59tAJ`) and then fails **`Subgraph not found`**. The slug
must exist before a deploy and creating it is a Studio dashboard action with a wallet signature.

| # | Task | Status |
|---|---|---|
| 2.1 | Create the `xorr-aqua` slug at thegraph.com/studio with the deployer wallet, then `cd subgraph-aqua && npx graph deploy xorr-aqua --deploy-key $GRAPH_DEPLOY_KEY --version-label v0.0.1` | **BLOCKED — credential does not exist in this repo.** Re-tested three ways rather than assumed: (a) the deploy still uploads to IPFS as `Qmctad…` and then fails `Subgraph not found`; (b) `subgraph_create` on `api.studio.thegraph.com/deploy/` answers `-32601 Method not found`, with and without the deploy key, so there is no API path; (c) opened thegraph.com/studio in a browser — it reads **"NOT LOGGED IN · Sign message to use Studio"**, and `.env` contains **no private key of any kind**, so the SIWE signature cannot be produced here. The browser half of this blocker is solved; the wallet half is not. |
| 2.2 | Set `AQUA_SUBGRAPH_URL` on both Railway executor services; confirm `/graph/decision` stops reporting "No Aqua book index configured". The consumer is `server/src/graph/aqua.ts`, which already throws `AquaIndexUnavailable` when the var is empty | **BLOCKED** by 2.1 |
| 2.3 | x402 Gateway queries — mechanism already verified (`402`, `eip155:8453`, 0.01 USDC per query, EIP-3009 via a `Payment-Signature` header). Composes the Studio subgraph with the Gateway: two Graph products, no dashboard needed | **BLOCKED — spends real mainnet USDC.** Not attempted; this is one of the three things worth pausing for, and it also needs a signing key the repo does not have |
| 2.4 | Surface the composition on `/judge`: show both sources and which one moved the routing decision | **BLOCKED** by 2.1 or 2.3 |

## Phase 3 — Make SwapVM a real fill

**CLOSED.** `fillsByVenue` on the fork now reads `{swapvm: 1, 1inch: 36, aqua: 5}`. The deployed
executor filled a $50 WETH order through `XorrDelegation.spend()` → `XorrSwapVMBook` → the official
SwapVM router, tx `0xc57787db011c861186dc3d66ef61b488ff793152a727b0ab09c0f6602715b89c`, with the
1inch aggregation router never touched — and the user received 0.020165 WETH where the aggregator
quoted 0.019971, because the maker's book priced inside it.

Three defects stood between the deployed contract and a fill, not one:

1. `ORDER_TUPLE` described four fields; `ISwapVM.Order` has three. Every decode produced garbage, so
   the fill could never have worked even with a maker present.
2. `buildSwapVmFill` returned the first program it could ENCODE. `delegatedFillArgs` is a pure view
   that encodes anything, so a superseded maker — still `Shipped` in Aqua's logs forever — was
   preferred over the aggregator and lost the trade outright. Each candidate is now dry-run through
   the real `spend()` and skipped if it cannot clear.
3. Nobody had ever shipped a program. `server/src/live-swapvm.ts` is the maker that was missing.

| # | Task | Status |
|---|---|---|
| 3.1 | `server/src/live-swapvm.ts`: funds a maker, compiles the program with the book's own `xycProgram`, ships to the OFFICIAL Aqua under the SwapVM router as the `app`, and proves `openPrograms()` finds it. Reserves are sized against the live aggregator quote — a book that quotes worse than the market is one the executor is right to skip, and a shallow one stops being best the moment it trades | **DONE** — 18/18 |
| 3.2 | Fill driven through `buildSwapVmFill` — the executor's own entry point, not the contract behind it. The maker's WETH moved to the taker, and `/metrics` counts a `swapvm` fill, which is derived from the activity row's own wording. Two negative controls: the executor refuses to plan a fill that cannot clear, and the ROUTER refuses one submitted anyway (`TakerTraitsInsufficientMinOutputAmount`, three frames deep) | **DONE** |
| 3.3 | README's SwapVM row is now **Done**, with the transaction hash, the venue counts and the price the user actually got | **DONE** |

## Phase 4 — Base mainnet

The only environment where the contract, 1inch fills, the tokenized equities, Aave and The Graph are
all real simultaneously. Every remaining "does not hold" traces here.

| # | Task | Status |
|---|---|---|
| 4.1 | Fund the deployer `0x364d7Bbc139541e0e37450D527ae154B5C292581` — currently **0 ETH** on Base mainnet — then `cd contracts && forge script script/Deploy.s.sol:Deploy --rpc-url $BASE_RPC --broadcast` | **BLOCKED** — mainnet action, spends real money |
| 4.2 | Point a build at it with `npm run build:base` (`scripts/build-base.mjs` already refuses localhost and verifies the executor reports `chain: base`) | **BLOCKED** by 4.1 |
| 4.3 | Re-deploy the delegation subgraph against the mainnet contract address so `indexesThisDeployment()` is true where trades happen, closing the permanent `/history` gap | **BLOCKED** by 4.1 |
| 4.4 | One real equity fill on mainnet, closing bar 2 | **BLOCKED** by 4.1 — spends real money |

## Phase 5 — Residue and hardening

Real, low severity, none blocking a track.

| # | Task | Status |
|---|---|---|
| 5.1 | Split into `executor/settle.ts` (167 lines); `run.ts` is **964**. Verified behaviour-preserving by running it, not by reading it — a real $40 order through the redeployed executor still settles on the maker's SwapVM program | **DONE** |
| 5.2 | Run, and it **FAILED** — the guard did not hold. A real double-click on "Try again" on the deployed app produced two `/limits` requests **11ms apart**, against one for a single click. The lock lived in a `useRef`, so it belonged to one component instance, and retry is the press that destroys its own button: `ErrorState` unmounts, the request fails, and it returns holding a fresh unlocked guard. Fixed by keying the guard on `testID` so the lock survives the remount; 4 more tests, re-verified in the browser | **DONE** |
| 5.3 | Counts corrected against real runs: **456** app+executor, **218** executor alone, **54** contract. Fixing the second number meant fixing the command: `(cd server && npm test)` could not COLLECT `news/feed.test.ts`, because `venues/oneinch.ts` throws without `ONEINCH_API_KEY` and only the ROOT vitest config loaded `.env`. Also deleted `server/vitest.config.mts`, which vitest never read — verified by breaking it deliberately and watching the suite pass | **DONE** |
| 5.4 | **No change needed, and now established rather than assumed.** The hosted bundle was downloaded and searched: it contains exactly one executor URL, `executor-production-1659` — the Sepolia deployment. The fork's developer-named rows live in a different database that the hosted app never queries, so nothing a judge can reach displays them | **DONE — not needed** |

**Phase 5 surfaced a defect the plan did not know about, on the hosted app.** A permission that had
expired thirteen hours earlier still showed a green **Live** badge headed "Agents are live", with
"Your permission has expired" a scroll below it on the same screen, and `/limits` reporting `$0
left today` under a $1,600 cap with nothing spent and no reason given for the zero. Expiry was
never one of the safety screen's states — `delegateUnusable`'s own docblock says a policy can be
"unrevoked, unexpired, cap intact", so the case was known and unchecked. The button offered **Stop
all agents**, which would have sent `revoke()` for a grant the contract already considers over.
Fixed as a fourth state built on the `expiryState` the banner already used, 11 tests. **G14** below.

## Phase 6 — Blocked on an external thing

| # | Item | Blocked on |
|---|---|---|
| 6.1 | LLM agent voice | `OPENROUTER_API_KEY` exists nowhere in the repo. `/bot/say` reports `{"source":"fallback","reason":"no_key"}`, and the chat says *"no language model is configured in this build"* rather than faking a reply |
| 6.2 | Privy policy attached to the user's embedded wallet | Privy requires the wallet's **owner** to authorise, and for an embedded wallet that is the user. `/safety` states this: *"Nothing we hold can attach it for you"* |
| 6.3 | Sepolia audit chain forked at entry 2 | Permanent by design — append-only by trigger, so it cannot be rewritten to look clean |
| 6.4 | Second chain deployment / other hackathons | Deferred. `XorrDelegation` is chain-agnostic and the venue adapter is one file |

---

## 3. What changed since the third plan

Not a task list — context a builder needs, because 86 commits is a lot to re-derive.

**The project became reachable.** `scripts/build-web.mjs` produces a static bundle verified to point
at the public executor, deployed at `https://web-production-3e214.up.railway.app`. Before this, the
only way to see the product was to clone it, create a Postgres and supply three API keys.

**Testing the deployed product as a user found what testing the code could not.** Twenty-two
defects, all fixed. The four that mattered most:

1. **The permission was signed by a browser extension, not the Privy embedded wallet.** `useWallets()`
   on web lists injected wallets alongside the embedded one and both call sites took `wallets[0]`.
   Worse, `useAuth().address` — the value registered with the executor as the policy owner — was the
   extension's too. Fixed by `src/auth/embeddedWallet.ts`.
2. **The kill switch worked on-chain and the safety screen said it had not.** `revoked=true` on the
   contract, green LIVE badge in the app, under a line promising the stop "takes effect in under a
   second". The badge read a persisted local boolean instead of the chain.
3. **Raw HTTP wire format was rendered to users in twenty places**, e.g.
   `502 : {"status":"failed","runId":"040c4097-…","error":"This netw`.
4. **A failed positions read became an empty portfolio**, telling a funded wallet it held nothing.

**A new invariant worth keeping:** several of these were screens disagreeing with the chain. The
rule the codebase now applies uniformly — and publishes on `/verify` — is *the permission is read
from the chain, never from our database*. `/limits` and `/safety` were the last two violations.

---

## 4. The gap list

Every gap, tied to the task it blocks, ordered by cost. Verified by running things on 2026-09-09.

| ID | Gap | Where | Blocks | Severity |
|---|---|---|---|---|
| **G1** | **The demo recording predates 86 commits** and was shot against localhost, which no longer resembles what the hosted link shows | `docs/demo/*` | 1.1–1.5 | **High** — it is the first thing a judge watches, and it now misrepresents the product |
| **G2** | **Only one subgraph is ever queried** — the `xorr-aqua` slug was never created, so `AQUA_SUBGRAPH_URL` is empty and `aqua.ts` throws `AquaIndexUnavailable` | Studio; `server/src/graph/aqua.ts` | 2.1–2.4 | **High** — the only unmet sponsor track |
| **G3** | **`XorrDelegation` is not on Base mainnet** — `eth_getCode` returns `0x`, deployer holds 0 ETH | — | 4.1–4.4 | **High** — gates bars 2 and 6, and the `/history` gap below |
| **G4** | ~~**SwapVM has never settled a fill**~~ — it has. `fillsByVenue` reads `{swapvm: 2, 1inch: 36, aqua: 5}`, the executor filling through `XorrDelegation.spend()` → `XorrSwapVMBook` → the official router at a better price than the aggregator quoted | `server/src/venues/swapvm.ts` | 3.1–3.3 | **CLOSED** |
| **G5** | **`indexesThisDeployment()` is false on the fork**, so `/history` has nothing to say where the trades actually are. Both screens now state this instead of claiming "nothing has settled", which is honest but not fixed | `server/src/graph/client.ts` | 4.3 | Medium |
| **G13** | ~~**Safety offered "Stop all agents" on a wallet with nothing granted**, and pressing it would have revoked a policy that never existed~~ | `src/state/derived.ts`, `app/safety.tsx` | 1.3 | **CLOSED** — found in the demo's closing frame, fixed and deployed |
| **G14** | ~~**An expired permission read as Live** on the hosted app — green badge, "Agents are live", and a **Stop all agents** button that would have revoked a grant the contract already considers over~~ | `src/state/derived.ts`, `app/safety.tsx`, `app/limits.tsx`, `server/src/routes/index.ts` | 5.x | **CLOSED** — found by reading the hosted executor's own `/limits`, fixed with 11 tests |
| **G6** | ~~**`run.ts` is 1,058 lines**~~ — 964, with venue selection in `executor/settle.ts` | `server/src/executor/run.ts` | 5.1 | **CLOSED** |
| **G7** | ~~**The double-tap gesture is unproven end to end**~~ — proven, and it was broken: the guard was per-component-instance, so a press that unmounted its own button lost the lock. Two `/limits` calls 11ms apart on the deployed app | `src/ui/pressGuard.ts` | 5.2 | **CLOSED** |
| **G8** | ~~**README test counts are stale**~~ — corrected to 460/218/54, and the command `(cd server && npm test)` was broken and now runs | `README.md`, `server/vitest.config.ts` | 5.3 | **CLOSED** |
| **G9** | ~~**Developer session names in the fork's audit trail**~~ — unreachable from the product: the hosted bundle contains exactly one executor URL, and it is the Sepolia one | fork Postgres | 5.4 | **CLOSED — not reachable** |
| **G10** | No LLM credential | env | 6.1 | **Blocked** |
| **G11** | Privy policy on the user's own wallet | platform | 6.2 | **Blocked** |
| **G12** | Sepolia audit chain forked at entry 2 | history | 6.3 | **Blocked**, permanent by design |

### Mock / stub / TODO sweep — clean

Ten keyword hits across `src/`, `app/`, `server/src/` and `contracts/src/`. **Every one is prose in
a comment explicitly disclaiming a mock**, plus one test-only shim:

- `src/test/react-native-stub.ts` — a Node shim aliased **only** in `vitest.config.mts`; never in a
  shipped bundle
- `src/data/local.ts` — *"Not a mock: market data is REAL"*
- `server/src/bot/llm.ts` — *"This is NOT a silent fallback to fake personality"*
- `server/src/routes/verify.ts` — *"nothing here that our own database could fake"*
- `server/src/fork-bootstrap.ts` — *"Nothing here is a mock: the USDC is Circle's"*
- `src/notifications/index.ts`, `src/wallet/allowlist.ts` — both explaining why a fake value was
  refused
- `src/bot/tone.ts`, `server/src/bot/tone.ts` — *"Never mock the user"*, persona copy
- `src/ui/README.md` — *"a fake bold off the regular face"*, typography

**No mocked data, no stubbed logic, no TODOs in shipped code.** `Placeholder` is a loading-skeleton
primitive in `src/ui/States.tsx`, not a placeholder value.

---

## 5. Current measured state

Everything below was produced by running it on 2026-09-09, not copied forward. Re-measured after the execution pass.

| Check | Result |
|---|---|
| Hosted app | `https://web-production-3e214.up.railway.app` — 200, boots to `/welcome` signed out |
| Executor (Sepolia) | up, `base-sepolia`, postgres up |
| Executor (fork) | up, `base-fork`, postgres up |
| Sepolia `/verify?owner=…` | **19 pass / 0 fail / 1 skip** (skip = equities, correctly) |
| Fork `/verify` | 14 pass / 0 fail / 6 skip |
| Delegation subgraph | block 46,574,549, no indexing errors, 3 policies indexed |
| `XorrDelegation` on Base Sepolia | 7,158 bytes |
| `XorrDelegation` on Base mainnet | `0x` — not deployed |
| Fork runs | 36 filled, 20 failed, 8 skipped, 2 blocked |
| Fills by venue | `swapvm: 2, 1inch: 36, aqua: 5` — the swapvm key exists for the first time |
| Client tests | **460** |
| Server tests | **218** — and `(cd server && npm test)` runs at all, which it did not |
| Contract tests | **54** |
| Typecheck | clean, both projects — the server's is stricter and had not been run |
| Lint | clean |
| `run.ts` | **960** lines, with venue selection in `executor/settle.ts` (167) |
| Double-tap on a real button | **one** action per double-click, verified on the deployed app by counting requests |
| Expired permission on `/safety` | reads **EXPIRED**, offers a new grant — it read green **Live** before |
| Console errors, full hosted sweep | **none** |
| Mock/stub/TODO in shipped code | **0** |

---

## 6. Suggested order

1. **1.1 → 1.5.** Re-record the demo. Unblocked, half a day, and it is the artefact every track is
   judged on. The current one actively misrepresents a product that got substantially better.
2. **2.1**, the moment someone can open a browser with the deployer wallet. Everything downstream is
   written and waiting on a slug.
3. **5.3, 5.1.** Cheap. Correct the README numbers, then split `run.ts` while its shape is fresh.
4. **3.1 → 3.3.** SwapVM. A day's work on the fork, no real money, and it converts the weakest
   sponsor claim into a transaction hash.
5. **4.1**, only with an explicit decision to spend. It closes G3, G5 and bar 2 at once, and is the
   difference between "works on a testnet and a fork" and "works on Base".
