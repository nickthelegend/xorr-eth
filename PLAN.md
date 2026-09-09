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
| 1.1 | Point `tools/demo.mjs` at the hosted app. It already reads the target from an env var — `tools/demo.mjs:26`, `const BASE = process.env.APP_URL ?? 'http://localhost:8082'` — so this is either running it as `APP_URL=https://web-production-3e214.up.railway.app node tools/demo.mjs`, or changing that default so the committed script records the shipped product by default. Prefer changing the default: the localhost fallback is what produced a recording nobody noticed was stale | **NOT STARTED** |
| 1.2 | Add a gas step to the script: a fresh Privy test account now receives 0.002 test ETH automatically on first connect, so the grant is signable inside the recording without manual funding. Confirm the run does not race the drip — wait for the balance to be non-zero before the delegate beat | **NOT STARTED** |
| 1.3 | Re-record all eight beats. Keep the existing rule from `docs/DEMO-SCRIPT.md`: leave a real FAIL or SKIP visible on `/judge` rather than cutting to a clean board | **NOT STARTED** |
| 1.4 | Regenerate `docs/demo/demo.gif` at 300px and re-link from the README's **Watch it work** section and the top of `docs/SUBMISSION.md` | **NOT STARTED** |
| 1.5 | Update `docs/DEMO-SCRIPT.md` for the two beats that changed: the hosted URL is now the opening shot, and `/judge` reads "19/20 · 1 skipped — each says why on its own row" | **NOT STARTED** |

## Phase 2 — Close The Graph track

Unchanged from the third plan and re-confirmed: `graph deploy xorr-aqua` uploads to IPFS
(`QmctadHCDBprb9Q1Pq4oyMXjB6KcnUDHRheDRNyBA59tAJ`) and then fails **`Subgraph not found`**. The slug
must exist before a deploy and creating it is a Studio dashboard action with a wallet signature.

| # | Task | Status |
|---|---|---|
| 2.1 | Create the `xorr-aqua` slug at thegraph.com/studio with the deployer wallet, then `cd subgraph-aqua && npx graph deploy xorr-aqua --deploy-key $GRAPH_DEPLOY_KEY --version-label v0.0.1` | **BLOCKED** — needs a browser and the deployer wallet |
| 2.2 | Set `AQUA_SUBGRAPH_URL` on both Railway executor services; confirm `/graph/decision` stops reporting "No Aqua book index configured". The consumer is `server/src/graph/aqua.ts`, which already throws `AquaIndexUnavailable` when the var is empty | **BLOCKED** by 2.1 |
| 2.3 | x402 Gateway queries — mechanism already verified (`402`, `eip155:8453`, 0.01 USDC per query, EIP-3009 via a `Payment-Signature` header). Composes the Studio subgraph with the Gateway: two Graph products, no dashboard needed | **BLOCKED** — spends real mainnet USDC |
| 2.4 | Surface the composition on `/judge`: show both sources and which one moved the routing decision | **BLOCKED** by 2.1 or 2.3 |

## Phase 3 — Make SwapVM a real fill

`XorrSwapVMBook` is deployed, covered by 10 fork tests including guards proving the deadline expires
and the fee costs, and `server/src/venues/swapvm.ts` is in the settlement path ahead of the
aggregator. `fillsByVenue` on the fork reads `{1inch: 35, aqua: 5}` — **no swapvm key**. Nothing has
ever settled through it, because discovery requires a maker to have shipped a SwapVM program to Aqua
and nobody has.

| # | Task | Status |
|---|---|---|
| 3.1 | Write `server/src/live-swapvm.ts`, modelled on the existing `server/src/live-aqua.ts` (398 lines): fund a maker wallet with inventory on the fork, compile an order with `encodeOrder`, ship it to Aqua with the **SwapVM router** as the `app`, then assert `openPrograms()` discovers it | **NOT STARTED** |
| 3.2 | Drive one fill end to end through `buildSwapVmFill` and assert the maker's ERC-20 balance moved and the activity row names `swapvm` as the venue | **NOT STARTED** |
| 3.3 | Once a fill exists, change the README's SwapVM row from **Wired** to **Done** with the transaction hash. Not before — the current wording is accurate | **NOT STARTED** |

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
| 5.1 | `server/src/executor/run.ts` is **1,058 lines** and grew again as venues were added. Split the venue-selection block (Aqua → SwapVM → aggregator) into `executor/settle.ts`, leaving `run.ts` as gates plus orchestration | **NOT STARTED** |
| 5.2 | End-to-end double-tap on a primary action could not be reproduced — Chrome's click injection stopped landing mid-run, so six attempts produced zero records. The guard now has 7 tests (`src/ui/pressGuard.test.ts`), but the gesture itself is unproven. Re-run test-plan item G7 in a working browser | **NOT STARTED** |
| 5.3 | README test counts say 432/214/54; actual is **445/214/54** after the press-guard tests. Re-check the numbers in the Tests section against a real run | **NOT STARTED** |
| 5.4 | The fork's audit trail carries developer session names — `FINAL fill after slippage fix`, `T7 entry FIRE 3`, `QA — daily WETH`. Append-only by design, so they cannot be removed; decide whether the demo should use a wallet whose trail is clean instead | **NOT STARTED** |

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
| **G4** | **SwapVM has never settled a fill.** `fillsByVenue` = `{1inch: 35, aqua: 5}`; no maker has shipped a program | `server/src/venues/swapvm.ts` | 3.1–3.3 | Medium — the one sponsor claim resting on tests, though the README says "Wired" not "Done" |
| **G5** | **`indexesThisDeployment()` is false on the fork**, so `/history` has nothing to say where the trades actually are. Both screens now state this instead of claiming "nothing has settled", which is honest but not fixed | `server/src/graph/client.ts` | 4.3 | Medium |
| **G6** | **`run.ts` is 1,058 lines** — grew past its post-split size again as venues were added | `server/src/executor/run.ts` | 5.1 | Low |
| **G7** | **The double-tap gesture is unproven end to end.** The guard has 7 tests; the browser could not deliver the gesture | `src/ui/pressGuard.ts` | 5.2 | Low |
| **G8** | **README test counts are stale** — says 432, actual 445 | `README.md` | 5.3 | Low |
| **G9** | **Developer session names in the fork's audit trail** — `FINAL fill after slippage fix`, `T7 entry FIRE 3` | fork Postgres | 5.4 | Low — append-only by design; the hosted deployment is clean |
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

Everything below was produced by running it on 2026-09-09, not copied forward.

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
| Fork runs | 33 filled, 19 failed, 8 skipped, 2 blocked |
| Fills by venue | `1inch: 35, aqua: 5` |
| Client tests | **445** |
| Server tests | **214** |
| Contract tests | **54** |
| Typecheck | clean, both projects |
| Lint | clean |
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
