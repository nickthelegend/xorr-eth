# xorr — build plan

**The fifth plan — 2026-09-13.** The fourth (2026-09-09) is in git history at `8def793`; its hosted URL
now returns 404 and it predates the redesign, so it was replaced rather than patched.

Written from seven read-only code audits (goals and brief, 1inch, Privy and the permission, executor,
app, contracts and The Graph, tests and delivery) plus live measurements taken the same day. Every
state below was checked by running or reading something, not copied forward.

Written for an agent to pick up cold: each task names its files and what "done" means. Status tags:
**DONE** · **IN PROGRESS** · **NOT STARTED** · **BLOCKED — reason**.

---

## How to work this plan

- **Rules from the owner.** No mocks, no fallback data, no stubbed logic. Real database, real deployed
  contracts, real signed transactions, real API calls with credentials already in the repo or on
  Railway. Pause only for real money, a mainnet action, or a credential that does not exist.
  Never print a secret value — names only. Never delete a Railway service, a Postgres, or their env vars.
- **Environments.**
  - *base-sepolia* — `executor` on Railway = `https://api.xorr.finance` (also
    `executor-production-1659.up.railway.app`). The contract and the user's Privy signatures are real;
    1inch cannot fill here.
  - *base-fork* — `executor-fork` (`https://executor-fork-production.up.railway.app`) on a Base mainnet
    fork served by `base-fork`. 1inch, Aqua and SwapVM fill for real; in-app user signing does not
    (see 4.1).
  - *local* — `cd server && npx tsx watch src/index.ts` on :8788 reads the root `.env` (base-sepolia).
    The iOS simulator app talks to this, not Railway — check with `lsof` before trusting a screenshot.
- **Deploy.** Executors are CLI uploads, not git-linked: `cd server && railway up --service executor`
  (then `executor-fork`); migrations run as the preDeploy step. Web: `npm run deploy:web` (Vercel CLI,
  project `xorr-eth`, domain `app.xorr.finance`).
- **Verify.** `npm test` (root, includes server) · `cd server && npm test` · `cd contracts && forge test`
  · `npx tsc --noEmit` in both projects · live checks with curl against the deployed executors ·
  `node tools/shoot.mjs` for screens.

---

## 1. What done and winning mean here

The claim the project serves, unchanged:

> **A bot trades your capital under a permission you granted on-chain, that you can read and revoke
> without our cooperation — and every number the app shows you can be checked somewhere we do not
> control.**

### Done — seven bars, all at once

| # | Bar | State on 2026-09-13 | Closed by |
|---|---|---|---|
| 1 | **The permission is real and safe** — cap, expiry and venues enforced on chain, output can only reach the owner, the deployed contract matches the source and is verifiable | **Does not hold.** Nothing on chain checks where swap output goes (`XorrDelegation.sol:179,232`, both books pay `principal`); `closePosition` is uncapped; the Sepolia contract lacks `closePosition` (bytecode checked) so it predates the source; nothing is verified on an explorer | Phase 1 |
| 2 | **The bot really trades from the app** — a strategy made in the app fills through Aqua, SwapVM or 1inch; nothing reports a trade that did not happen | **Partial.** Fork: 41 filled runs (`swapvm 4 · 1inch 36 · aqua 7`), but SwapVM is not in the venues an app grant allows, books are shipped only by scripts, and approving a chat proposal writes "Filled…" without trading | Phases 1, 3 |
| 3 | **Nothing on screen is invented** | **Does not hold.** Fixture agents render when the server fails; onboarding goals and sleeves are design fixtures; 27 instruments with no feed are listed; failed chain reads return `$0` or "revoked"; the portfolio graph is today's holdings replayed over old prices | Phases 2, 5 |
| 4 | **A stranger can verify it** — `/verify`, `/judge`, the audit anchor, the subgraph | **Holds on Sepolia.** `/verify?owner=0x95A0…e615`: **19 pass · 1 fail · 1 skip** (fail = audit chain forked at entry 2, permanent by design; skip = equities). Must be re-proven after the contract redeploy | Phase 1 |
| 5 | **A stranger can finish the core loop on the hosted app** — sign in → fund → grant → a fill → P&L → withdraw | **Does not hold.** Sepolia signs but cannot fill; the fork fills but cannot take a user signature; a new wallet has no USDC and no way to get any | Phase 4 |
| 6 | **Simple and good-looking** — three-button shell, every kept screen within three taps, one visual language, real charts | **Partial.** 8 of 101 route files in the new look, 41 reachable only via Profile → Settings → Explore, 13 orphaned, More tab blank, and the redesign is not deployed | Phases 0, 5 |
| 7 | **Shipped honestly** — committed history, CI green, deployed build equals the repo, docs match code, a 2–4 minute demo | **Does not hold.** ~80 uncommitted files, CI 0 of 76 runs green, the live web bundle is pre-redesign, `/health` has no version, the demo is 91 s, silent and shows no fill | Phases 0, 6, 7 |

### Winning — the sponsor tracks (ETHOnline 2026, plus Base Build Camp)

| Track | Official bar, summarised | State | Closed by |
|---|---|---|---|
| **1inch — Build an Aqua App** ($5k) | Custom Aqua app using official Aqua/SwapVM contracts; on-chain token transfers shown in the final demo (forks allowed); real commit history; positions shown via scripts or UI | **Met on the fork, fragile.** Books are shipped by hand-run scripts; the app's grants cannot reach SwapVM; the demo shows no transfer; ~80 files uncommitted | 0.1, 3.1–3.3, 7.6 |
| **Privy — Best B2B Financial Product** ($2.5k) | Privy core with a wallet; a business use case; a working B2B workflow; at least one Privy control | **Partial.** Key-quorum policy proven with a live refusal, but only on a server-owned demo wallet; no business use case or workflow is written | 4.13, 4.14, 7.2 |
| **Privy — Best Financial Flow** ($2.5k) | One completed flow with a GA Privy feature (transfer, swap, onramp…) | **Partial.** User-signed approvals and grant only; no withdrawal on record | 4.4, 4.9, 7.2 |
| **The Graph — Composable / Standardized** ($5k) | Two or more Graph products, or a standardized schema; live data | **Not met, not claimed.** One subgraph; the Aqua slug needs a Studio login | 8.3 |
| **Base Build Camp** | Real transactions on Base | **Not met.** Nothing on mainnet | 8.1 |

No deadline is recorded anywhere in the repo or on the ETHGlobal pages — see 7.7.

---

## 2. Phases

Ordered by dependency and by what does the most damage if left.

| # | Phase | Why here |
|---|---|---|
| 0 | **Ship what already works** | Everything later needs a clean tree, a green CI and a deploy path that is known to work |
| 1 | **Security and correctness** | Two live authorization holes, an unenforced contract promise and a fake fill on a deployed service |
| 2 | **Backend: honest data and speed** | Zeros from failures, positions that disagree with the chain, 4–9 s routes |
| 3 | **1inch: complete, reachable, accounted** | The strongest track, currently resting on scripts; the wallet features the owner asked for |
| 4 | **Wallet and Privy: a loop a stranger can finish** | Bar 5 and both Privy tracks |
| 5 | **UI: simpler and cooler** | Bar 6; depends on the data and features above existing |
| 6 | **Tests and CI depth** | The riskiest paths have no executor tests |
| 7 | **Docs, demo and submission** | Written last so they describe the final product |
| 8 | **Blocked on an external thing** | Each names exactly what it waits on |

---

## Phase 0 — Ship what already works

| # | Task | Status |
|---|---|---|
| 0.1 | Commit the 2026-09-12/13 work as coherent commits: shell and Home/Portfolio/Profile redesign; motion primitives (`src/ui/Rise.tsx`, `RollingNumber.tsx`, chart `drawIn`); `BackButton`/`CloseButton` across 38 screens; Futures (`server/src/market/hyperliquid.ts`, `perp.ts`, `/market/futures`, `/perp/:symbol/candles`, `app/futures.tsx`, `app/perp/[symbol].tsx`, `app/funding.tsx`); Strategies out of the tab group. Add `/reference-ui.mp4` to `.gitignore`. Done when `git status` is clean and both suites pass | **DONE** — six commits `36c607a`…`3980d6a` (server futures; motion; back/close buttons; futures screens; shell and screens; this plan), with the Strategies move in the shell commit; both suites green on that tree |
| 0.2 | Fix CI install: `@privy-io/expo@0.72.0` wants exactly `viem@2.56.0`, root pins `^2.56.3` (`package.json`). Pin viem to 2.56.0 at the root (and server if shared), regenerate `package-lock.json`, prove `npm ci` works in a fresh clone | **DONE** — GitHub run 34727643070 on `80a8c62`: install, both typechecks, lint, unit tests and forge all green. viem pinned to 2.56.0 and the lock regenerated. The first "passes in a clean copy" was wrong: those installs inherited `legacy-peer-deps=true` from this machine's user npmrc (`npx` hands it to the child npm as env config), which is exactly what a runner lacks. Reproduced with a real npm 10.9.9 and no inherited config: root `npm ci` exit 1 (ERESOLVE — `@solana/kit`, pulled in by `@privy-io/react-auth`, declares `peerOptional typescript ^5`; the app is on 6.0.3), server `npm ci` exit 1 (lock out of sync on `utf-8-validate`). With `legacy-peer-deps=true` committed in `.npmrc` and `server/.npmrc` — the setting both lockfiles were resolved with — both exit 0; tsc, lint and root tests (61 files / 558) pass on an npm 10 install with that setting |
| 0.3 | Make `server/src/market/ids.test.ts`, `news/feed.test.ts`, `routes/alerts-validation.test.ts` pass without `.env` via `test.env` placeholders in `vitest.config.mts` and `server/vitest.config.ts`; prove it in a clone with no `.env` | **DONE** — placeholders for `ONEINCH_API_KEY`, `PRIVY_APP_ID`, `PRIVY_APP_SECRET` in both configs (unit runs only); `event-driven.test.ts` uses anvil's public dev key; six lint errors fixed on the way. Clean copy with no `.env`: root 61 files / 558 tests, server 37 / 277, both typechecks and lint clean. The runner has no `.env` either, and run 34727643070 passed |
| 0.4 | Push and get CI green on GitHub (`gh run watch`); fix whatever else fails | **DONE** — run 34727643070 (`80a8c62`) green on both jobs, `checks` and `contracts` — the first green run; every earlier one, including 34726695181 on `b5878ba`, failed at Install for 0.2's reason |
| 0.5 | `/health` reports the deployed git SHA (`server/src/routes/ops.ts`), set at deploy time; verify with curl | **DONE** — `version` in `/health`, fed by `XORR_BUILD_SHA`, which `scripts/deploy-executor.mjs` (`npm run deploy:executor`) sets before uploading and then waits for. Both executors report `b5878ba82ccc7122fda7e50f426db301446a36b8` |
| 0.6 | Deploy `executor` and `executor-fork` from the committed tree; verify `/market/futures` answers 200 on both and `/health` shows the SHA | **DONE** — both deployed at `b5878ba`. The first attempt failed before uploading (`railway up server` → "prefix not found"); the script now uploads from inside `server/` with project, environment and service named. Live: `/market/futures` 200, `/perp/BTC/candles` 200, `/market/logos` 200, every dependency up on both |
| 0.7 | Web: default API in `scripts/build-web.mjs` → `https://api.xorr.finance`; `npm run deploy:web`; verify the live bundle contains the redesign ("Total balance", "Gainers") and calls api.xorr.finance | **DONE** — deployed 2026-09-12 23:59 UTC (Vercel `dpl_3mtdrFWLuyGAEXp7cmKSq2ffWnjH`, aliased to app.xorr.finance). The live bundle was downloaded and read: its only executor host is `https://api.xorr.finance`, and it contains "Total balance", "Gainers", "/market/futures" and "Copy address" |
| 0.8 | `server/railway.json` matches live (RAILPACK, preDeploy `npm run migrate`, start `npm start`); healthcheck on `executor-fork` | **DONE** — `server/railway.json` now says Railpack, `npm run migrate` as the pre-deploy command, `npm start`, `/health` check; it ships with every upload, so `executor-fork` has the health check too. Both deploys built with Railpack and came up healthy |
| 0.9 | `.env.example`: add the 18 missing server names with comments (incl. `PRIVY_AUTHORIZATION_KEY`, `PRIVY_KEY_QUORUM_ID`, `OPERATOR_TOKEN`, `ANCHOR_ADDRESS`, `SWAPVM_BOOK_ADDRESS`, `SUBGRAPH_DELEGATION_ADDRESS`, `ANCHOR_EVERY_MS`, `SEC_USER_AGENT`, rate-limit and HTTP knobs); fix the malformed `.gitignore` line that leaves `tools/.auth.json` unignored; add `*.pem *.p8 *.p12 *.jks` patterns; add `.keys/` to `server/.railwayignore` | **DONE** — 18 names documented with their defaults; unused `EXPO_PUBLIC_DELEGATION_ADDRESS` removed; the glued expo-cli line fixed so `tools/.auth.json` is ignored (verified with `git check-ignore`); key-file patterns added; `server/.railwayignore` excludes `.keys/` and key files |
| 0.10 | Add a LICENSE | **BLOCKED — owner decision.** The repo is public; the licence is the owner's legal choice |
| 0.11 | Remove stray tracked files (`head.svg` 22 MB, `ui and prompt.zip`, `server/sectionb.ts`, `server/killswitch.ts`) | **BLOCKED — owner decision.** Owner-supplied assets; deleting them is the owner's call |

## Phase 1 — Security and correctness

| # | Task | Status |
|---|---|---|
| 1.1 | **Wallet takeover.** `/wallet/connect` and `/wallet/create` (`server/src/routes/index.ts:88,154-172`) accept any address and reassign its row to the caller. Accept only addresses linked to the caller's Privy user (`privy.getUser` linked accounts); answer 409 instead of reassigning `user_id`; label embedded wallets `kind='embedded'`. Vitest proving a second user cannot claim a wallet; live check with two Privy test users | **DONE** — deployed at `80a8c62` to both executors (their `/health` reports it) and re-proven there: `wallet-takeover.live.test.ts` passes 5/5 against api.xorr.finance and against executor-fork, with two real Privy test accounts. `verifyToken` returns every Ethereum wallet on the Privy account (`wallets`; undefined when Privy cannot be asked, never read as "none"). `server/src/auth/walletBinding.ts` holds the one upsert both routes use: it updates only a row the caller already owns and takes `inserted` from the write itself. `/wallet/connect`: 403 `wallet_not_linked` for an address not on the caller's account, 409 when the row is someone else's, 503 when Privy cannot be asked. `/wallet/create` no longer reads the body. Embedded wallets are stored as `embedded`; the gas drip fires only on a genuine insert. Proven: `walletBinding.test.ts` (4); `walletBinding.live.test.ts` on local Postgres (3 — insert, same-user touch, a second user refused with the row unchanged); `wallet-takeover.live.test.ts` with two real Privy test accounts against the local executor (5 — 403 in any letter case, create ignores the body, the row stays with its owner, the owner's reconnect writes no second registration). Server suite 38 files / 281 |
| 1.2 | **Strategy ownership.** `/strategies/:id/{pause,resume,end}` and PATCH/DELETE (`server/src/routes/strategies.ts:592-665`) do not check the wallet. Scope by `wallet_id`, append an audit row, delete the duplicate PATCH/DELETE registrations. Tests | **DONE** — deployed at `fbaa2c5` to both executors and re-proven there: `strategy-ownership.live.test.ts` 7/7 against api.xorr.finance and against executor-fork; CI run 34728392669 green. Every state change goes through one `moveStrategy`: scoped to the caller's wallet (another account's id answers `not_found`), written on the trail only when the state actually changes, `ended` stays ended (409 `strategy_ended`), and resuming asks the same on-chain cap question creating does (`commitmentRefusal`, now shared) — pausing frees allowance, so pause → create → resume used to commit past the cap. Duplicate PATCH/DELETE removed. `requireWallet` throws `NoWalletError`, answered 409 `no_wallet` instead of 500. Proven: `strategy-ownership.live.test.ts` with two real Privy test accounts against the local executor (7/7 — the other account gets 404 from all five routes, the owner's strategy and trail are untouched, owner resume/pause writes each change once and a repeated tap nothing, ended stays ended); tsc clean; server suite 38 files / 281 |
| 1.3 | **Fake fill.** Approving a proposal (`server/src/routes/extra.ts:289-339`) writes "Filled X at Y" and trades nothing. Make approve run a one-off buy through the `/orders` path and return the real run; scope the UPDATE by wallet; client (`src/chat/Chat.tsx:314-330`) marks decided only on success and renders filled or refused from the status. Verify on the fork | **DONE** — the fill is proven on the rebuilt fork: `proposal-approve.live.test.ts` 3/3 against executor-fork at `47b1296` (approve answered `filled` with a transaction hash and "Bought … WETH at $…", the exit strategy it armed was live, a second approve placed nothing, another account got `gone`), after the same test passed 3/3 on Sepolia on the refusal path. Deployed at `400d64e` to both executors and the web app (Vercel `dpl_6Ht6W4mVEteHGJrSzmQuJAvo1XrQ`; the live bundle carries the new approve copy); CI run 34728962882 green. `proposal-approve.live.test.ts` passes 3/3 against api.xorr.finance. Against executor-fork, approve answered `failed` and claimed nothing — and a plain `POST /orders` there fails the same way: the router reverts `ReturnAmountIsNotEnough` (0x9a446475), because the `base-fork` chain has drifted from the mainnet state 1inch quotes. That is the fork being stale, not the approve path; the fork is re-forked and re-bootstrapped in 1.5 and the fill is proven there. Approve places the order through `placeOrder` (`server/src/executor/order.ts`, which `POST /orders` now also uses) and answers with what happened: `filled` with the transaction hash, plus an `exit-rules` strategy holding the stop and target (measured from the fill price; an exit already live on the symbol is left alone), or `blocked`/`failed` with the executor's own sentence. The UPDATE is scoped by wallet and the order runs after the decision commits. Payloads carry `usd`, `stopPrice`, `targetPrice` as decimals; the pre-written `onApprove` "Filled…" now states what approving will do. Client: decided only after the executor answers, buttons disabled while in flight, `decisionMessage` renders fill / blocked / declined / expired from the status; the unused `fillMessage` template ("…SOL at…") is gone. Found on the way: the skip reply promised "I will not re-propose X today" and nothing enforced it — `propose()` now refuses a symbol skipped that UTC day. Proven locally: `proposal-approve.live.test.ts` 3/3 on base-sepolia (another account gets `gone`; approve answers `failed` — "This network cannot settle trades. Prices are real; filling needs Base or a Base fork." — and claims no fill; a second approve places nothing); `proposal-decline.live.test.ts` still passes; both typechecks clean; root 62 files / 562, server 38 / 281 |
| 1.4 | **Contract: output can only reach the owner.** In `contracts/src/XorrDelegation.sol`: record the active owner for the duration of a venue call; `XorrAquaBook`/`XorrSwapVMBook` `fillForDelegation` revert unless `principal` is that owner; for the 1inch path require the owner's output-token balance to rise; `closePosition` refuses the settlement token; `grant` clears the previous venue list. Forge tests: wrong principal, wrong 1inch receiver, re-grant drops venues | **DONE** — built and tested at `47b1296`, deployed in 1.5, and proven with real transactions on the rebuilt fork: a $5 WETH buy through the new `spend` (tx `0x854b…22e0`) delivered 0.001974 WETH to the owner's wallet, and `POST /positions/close` sold 0.003948 WETH through the new `closePosition` (tx `0x1893…675a`) with +9.938452 USDC landing in the owner's wallet and nothing left in the contract. `spend`/`closePosition` take `tokenOut` and a non-zero `minOut`, and the owner's `tokenOut` balance must rise by `minOut` across the venue call (`OutputNotReceived`). The owner is held in EIP-1153 transient storage for exactly the venue call (`activeOwner`), and both books refuse a delegated fill — and the Aqua taker path reached through the delegation — that pays anyone else (`RecipientNotActiveOwner`). `closePosition` refuses the settlement token (fixed at construction); `grant` replaces the venue list. The executor passes a floor on every trade (router `dstAmount` less slippage, a book's quote less slippage, a SwapVM program's compiled minimum, the aToken for an Aave supply) and names the new errors. The honest limit, written into the contract's header: the floor is chosen by the delegate, so a route paying the owner exactly the floor and the rest elsewhere is bounded by the cap, the allowlist and the kill switch, not by this check. Proven: `XorrDelegationTest` 31/31 (wrong receiver on spend and on close, short-changed output, zero floor, invalid `tokenOut`, active owner visible only during the call, re-grant drops venues including a toggled one, settlement token refused); fork suites 35/35 against Base state (Aqua 17, SwapVM 11, Stocks 7) including a fill naming an attacker on both books and the delegated taker swap; server 38 files / 281; tsc clean |
| 1.5 | **Redeploy and prove.** Deploy the fixed contracts to Base Sepolia with the deployer (`0x364d…2581`, 0.109 test ETH); verify on Sourcify (`forge verify-contract --verifier sourcify`); commit `contracts/deployments/base-sepolia.json`; update `DELEGATION_ADDRESS` on `executor`, root `.env`, README, `subgraph/subgraph.yaml` (ABI with `Closed`); redeploy the delegation subgraph (`GRAPH_DEPLOY_KEY` exists); rebuild the fork's contracts; re-run `/verify` | **DONE** — and `/verify` on Sepolia is back to its baseline on the new contract: **19 pass · 1 fail · 1 skip** (the fail is the permanent `audit-chain` fork at entry 2; the skip is equities). The demo wallet re-granted through the hosted app's own permission screen: $1,600/day for 30 days, tx `0xce90642d…6a1f`, delegate `0xC38f…c8A5`, read back from `policyOf`. The first attempt sent both approvals and never broadcast the grant; the second, with stall diagnostics added to `tools/grant-test-wallet.mjs`, went through. It also exposed a real bug: `/delegation/record` answered the landed grant 400 `tx_not_found`, because `waitForTx` asked the executor's node for the hash once, a moment before that node had heard of it — fixed with a bounded look-up (see below). Base Sepolia: `XorrDelegation` `0x6c5528Fd8E74a047A85bAb413856A9239E73540e` (block 46746780, tx `0x51a2…2ac0`, settlement token USDC `0x036C…CF7e`) deployed from `47b1296`; Sourcify **exact match** (creation and runtime); recorded in `contracts/deployments/base-sepolia.json`. Delegation subgraph v0.0.3 (`QmYaEZ…DKM6`) indexes it, now including `Closed`, synced with no indexing errors; both executors' `SUBGRAPH_URL` point at it. `executor` switched (`DELEGATION_ADDRESS`, deployed at `47b1296`, every dependency up); root `.env` and README updated. Fork: `base-fork` re-forked at mainnet head (block 51236256); new `XorrDelegation` `0xd5fa…17e9`, `XorrAquaBook` `0xcd0c…a4dd`, `XorrSwapVMBook` `0xa9f5…7c84` from the same build (rebuilt again at head since — see 1.10); demo wallet funded with 25,000 USDC and granted $2,810/day to the executor's delegate; executor-fork switched and redeployed; a real fill, a real close and a real approve proven there (1.3, 1.4). Before the re-grant, `/verify` read 17 pass · 3 fail · 1 skip — `policy` and `cap-agrees` failed only because the demo wallet had no grant on the new contract yet, which the re-grant above closed |
| 1.6 | **Scheduler survives errors.** `server/src/executor/run.ts:299-365` runs wallet, policy and rules reads after the claim but outside the `try`; `scheduler.ts` has no per-strategy catch or overlap guard; blocked/failed runs never advance `next_run_at`; transient retries every 30 s write an audit row each time. Fix all four; tests | **DONE** — deployed at `d76845a` (migration 014 applied by the pre-deploy step) and completed at `31226d7`, and proven on the running fork: before, four "QA — daily WETH" strategies were overdue and the executor logged them `skipped` on every tick (their period was already claimed by runs that ended before `settleSchedule` existed); after two ticks on `31226d7`, **0 of 9 live strategies overdue**. That last gap — a claimed period leaving a due schedule in place — is closed by `runStrategy` moving a still-due schedule on when the period holds a finished run (a `pending` one is left to settle itself; `run-failure.test.ts` now 7). (1) Every throw after the claim — the wallet, `readPolicy` and rules reads included — goes through one `failRun`, so nothing escapes with the run left `pending`. (2) `tick()` catches per strategy, so one throwing strategy no longer ends the tick or skips the alert and anchor sweeps; `guardedTick` skips a tick while the previous one is still running instead of stacking them. (3) Blocked, failed, no-op, watch and filled runs all go through `settleSchedule`, which moves `next_run_at` to the next period — a blocked strategy no longer stays due and re-selected every tick. (4) A transient failure backs off 1 → 2 → 4 … → 30 min from a due schedule (`retryDelayMs`, migration `014` adds `strategies.retry_attempts`) and writes "Retrying" once per streak, not every tick. Proven: `run-failure.test.ts` 4/4 against the real `runStrategy` (timeout on the permission read releases the period, backs off 60 s then 120 s, one trail row; a permanent failure closes the run and moves the schedule a day; a blocked run moves it too), `scheduler.test.ts` 2/2 (a throwing strategy does not stop the next or the alert sweep; an overlapping tick is skipped); migration applied locally; executor suite 40 files / 287; tsc clean |
| 1.7 | **A failed read is an error, not a zero.** `/wallet/balance` returns `usd:0` on chain failure; `/delegation` returns null; `/limits` says `revoked:true`; `getPosition` falls back to `all[0]` (`routes/index.ts:223-226,261,390,864-870`; `positions/index.ts:259`). Return 502 `chain_read_failed` / null for unknown ids; client shows a dash or ErrorState. Tests | **DONE** — deployed at `31226d7` (both executors and the web app). `readChain` turns a thrown chain read into `ChainReadFailed`, answered **502 `chain_read_failed`** by the error handler (moved to `http/errors.ts` so it is testable): `/wallet/balance` (balance and permission), `/delegation` (permission and allowed venues), `/limits`, `/limits/check` and the backtest cap no longer substitute `0`, `null`, `[]` or `revoked: true` for a failed read. `/limits` distinguishes never granted (`granted: false, revoked: false`) from revoked, and the Limits screen says "Nothing — no permission granted yet". `getPosition` no longer falls back to the wallet's first position; `/positions/:id` is 404 for an id not in the book (the client already maps that to its not-found state). Proven: `errors.test.ts` 4/4 (502 with the sentence, `null` and `[]` pass through as answers, the other statuses kept); `read-failures.live.test.ts` 2/2 against the local executor, **api.xorr.finance and executor-fork** (an unknown position id is 404; the second test account, which holds a wallet and no grant, reads `granted: false, revoked: false`). Found on the way and fixed: `waitForTx` asked the executor's node for a hash once, so `/delegation/record` refused a real grant the node had not yet seen — now a bounded 15 s look-up (`wait-for-tx.test.ts` 3/3), proven by a second grant through the hosted app that reached `/proposal` ("renewed.", expiry 2026-10-13T01:48:02Z) with no 400 |
| 1.8 | **Gas faucet.** Drip only after a verified binding (1.1) and only once, via `INSERT … ON CONFLICT DO NOTHING RETURNING` (`server/src/evm/gasDrip.ts`, `routes/index.ts:163-211`); pay from a dedicated faucet key rather than the delegate key. Test the race | **DONE** — deployed at `a3a3247` and proven on a first visit by an account that had never used the app: `test-4668@privy.io` signed in through app.xorr.finance, its new wallet `0x0EAc…3c16` was registered (trail: "Wallet connected", "Sent 0.002 test ETH for gas"), the 0.002 ETH arrived **from the faucet `0xCdCf…3795`** (tx `0x9971…07d9`), and the same wallet then signed a real $1,600/day grant with that gas (`policyOf` confirms it). The faucet went from 0.02 to 0.018 ETH; the delegate paid nothing. Once-only and verified-binding-only were delivered by 1.1 (`bindWallet` reports `inserted` from the write itself, and only an address on the caller's Privy account reaches it). The drip now pays from a dedicated `FAUCET_PRIVATE_KEY` (`0xCdCf…3795`, generated for this, funded with 0.02 Sepolia ETH from the deployer, set on `executor` only) and never from the delegate; without a key it sends nothing and says so. Proven: `gasDrip.test.ts` 4/4 (no key → nothing sent; an empty wallet is paid by the faucet, which is named as the sender, and no delegate balance is read; a funded wallet is not topped up; a nearly empty faucet refuses); the race — eight simultaneous first connects against the real local Postgres produce exactly one `inserted` (`walletBinding.live.test.ts` 4/4) |
| 1.9 | **Privy policy rules match calldata.** `server/src/auth/privyPolicy.ts:181-189` matches only `to`, so `USDC.transfer(attacker)` passes. Add calldata conditions on `transfer`/`approve` recipients; make `/privy/policy/prove` operator-only; cache policy reads. Re-prove the refusal live | **DONE** — deployed at `3989ef9` to both executors and proven live, holding every credential the server has: `POST /privy/policy/prove` with the operator token on api.xorr.finance and on executor-fork — `USDC.approve(delegation, 0)` got past the policy (and then failed for want of gas on the empty demo wallet, which is the policy allowing it), while `USDC.transfer(0x…dEaD, 0)`, `grant(0x…dEaD, …)` and a send to an unlisted address were each refused `RPC request denied due to policy violation`; the signed owner write went through (`proven: true`, `authorizationKey.signed: true`). A signed-in user gets **403**. Read back from Privy: the Sepolia policy holds 5 rules and the fork's 13 (the eight equities are approvable only there), every one pinning `to` and a decoded argument or function name. The first proof after the deploy was **not** proven — `transfer`, and on Sepolia a grant to a stranger, passed — because the route probed the remembered demo wallet without bringing the policy up to date first, and only its closing key check patched the new rules in; the same request a minute later came back proven on both. The route now calls `ensurePolicy()` before probing, so a proof always tests the rules the build means. Every rule now pins the call as well as the destination (`ethereum_calldata` conditions, per Privy's policy API): each token may only be `approve`d with the delegation as spender; the delegation may be `grant`ed only to this executor's delegate and `revoke`d; nothing else — no `transfer`, no `setVenue`, no address on no list. The Aave pool is left out on purpose: one policy serves every wallet on a deployment, so it cannot pin `supply(onBehalfOf)` or `withdraw(to)` to the signing wallet. `ensurePolicy` compares every condition (comparing the first `to` alone would never have replaced the old rules) and is cached for 5 minutes, the wallet list for 1; `/privy/policy/prove` is operator-only (`requireScope('admin')`) and now probes an approve to the delegation (must pass) and a `USDC.transfer` to a stranger, a grant to a stranger and a send to an unlisted address (all must be refused). Proven locally: `privyPolicy.test.ts` 6/6, evaluating the rules the way Privy documents matching against the real calls |
| 1.10 | **Tier 6–7 need approval.** `requiresApprovalByDefault` (`src/strategies/ladder.ts:99`) is never called, so momentum and event-driven would trade unattended. Refuse `live` without `params.autoExecute`; otherwise write a proposal. Tests | **DONE** — deployed at `3989ef9` and proven with a real approve on the fork: `strategy-proposal.live.test.ts` 1/1 against executor-fork at `35c4395` — a paused momentum strategy's proposal, approved through `/proposals/:id/decide`, answered `filled` with a transaction hash and "… now manages it, with its stop at $1,000", and that strategy's own `params` then held `stopPrice` 1000 and `openEntryPrice` at the WETH price actually paid instead of the planner's placeholder of 1; the test sold the WETH back and ended the strategy. The first run, before a rebuild, answered `failed` — "The price moved more than your slippage limit while this was in flight. Nothing was placed." — because `base-fork` was 1,796 blocks (~1 h) behind live Base, the staleness described in 1.3; nothing was placed and nothing claimed a fill. So the fork was rebuilt at head (block 51238069) per `docs/RUNBOOK.md`: `XorrDelegation` `0xc535…e44e`, `XorrAquaBook` `0x74e1…c54f`, `XorrSwapVMBook` `0x2fba…7bd1`, the owner funded with 25,000 USDC and granted $2,810/day to the executor's delegate (tx `0x12c2…a973`), executor-fork pointed at the new addresses and redeployed. `/verify` on it then read **19 pass · 0 fail · 2 skip**, and the Privy proof re-ran `proven: true` against the new delegation — the policy followed the address change on its own. Implemented as the second half of the task rather than a refusal: a live momentum or event-driven strategy without `params.autoExecute: true` no longer trades an entry — `runStrategy` writes a proposal (size, symbol, stop, and the state the strategy should hold, naming the strategy), ends the run `skipped · awaiting_approval`, moves the schedule on and pushes `proposal-awaiting`; one open proposal per strategy. A close never waits for a yes. Approving (`/proposals/:id/decide`) places the order through `placeOrder` and hands the position to the strategy that asked — its `stateAfter` written with the entry at the fill price — instead of arming a second exit; skipping answers with the strategy's own `onSkip`. Proven locally: `approval-first.test.ts` 5/5 against the real `runStrategy` (an entry becomes a proposal and nothing reaches settlement; one proposal while one is open; `autoExecute` goes straight to settlement; a momentum stop and a recurring buy are never turned into questions) |
| 1.11 | **CORS.** Production answers `*`. Set `ALLOWED_ORIGINS` on both executors to the real origins; verify with a preflight from a foreign origin | **DONE** — both executors had `ALLOWED_ORIGINS=*` set explicitly, and a preflight from `https://evil.example` got `access-control-allow-origin: *`. Now `ALLOWED_ORIGINS=https://app.xorr.finance` on `executor` and `executor-fork`; measured after the redeploy on both: a preflight from `https://evil.example` gets `https://app.xorr.finance` back (the browser refuses the mismatch) and one from `https://app.xorr.finance` gets its own origin, with `vary: Origin`. Native builds send no Origin and are unaffected |
| 1.12 | `POST /audit/anchor` (`routes/index.ts:830`) spends bot gas with no limit — one per wallet per hour | **DONE** — deployed at `3989ef9` and proven on api.xorr.finance with the owner test account: press 1 answered 200 `unchanged` ("Already anchored at entry 81, block 46748045"); a paused probe strategy then wrote a new trail row; press 2 answered **429 `rate_limited`** with `retry-after: 2809` — "This trail was anchored to Base less than an hour ago. The next anchor can be published in 47 minutes, and the hourly anchor will publish it anyway." — and sent no transaction. The probe strategy was ended. `POST /audit/anchor` goes through `anchorOnDemand`: an unchanged head still answers `unchanged` for nothing; a press that would spend gas less than an hour after the wallet's last anchor — counted from the anchor's own block timestamp on chain, so nothing stored here can reset it — answers **429 `rate_limited`** with `retry-after`; two presses at once share one transaction. The hourly sweep is unaffected. Proven locally: `anchor-limit.test.ts` 3/3 |

## Phase 2 — Backend: honest data and speed

| # | Task | Status |
|---|---|---|
| 2.1 | **Auth overhead (~0.45 s per request).** Call `agentFor` only for `xagt_` tokens (`server/src/auth/middleware.ts:95`); cache `privy.getUser` per user for 5 min and pick the embedded wallet (`auth/privy.ts:59-63`). Measure before/after | **DONE** — deployed at `031d578` to both executors. Measured first, and the premise did not hold there: from this machine, over a ~240 ms round trip, a signed-in request that routes nowhere cost **+17 ms** (Sepolia) and **+14 ms** (fork) over an unauthenticated one before the change, and +35 ms on the local executor — not ~0.45 s. What it spent was still worth removing: every Privy session was first looked up as an agent key (`agentFor`, a database write stamping `last_seen_at`), and every request asked Privy's API for the account (`getUser`, which Privy's SDK marks strictly rate-limited). Now only `xagt_` tokens are looked up as keys (every minted key has carried the prefix since agent keys existed), and the account record is reused for five minutes per user while the token itself is still verified on every request; a failed read is never kept; `/wallet/create` and `/wallet/connect` ask Privy again (`freshWallets`) before refusing an address missing from the cached record, so a wallet linked a moment ago is not turned away. The embedded-wallet preference named here was already in place from 1.1. After the deploy the signed-in difference is inside run-to-run noise (p50 over 8 requests: Sepolia −20 ms, fork +33 ms). Locally a signed-in request that routes nowhere went from 37 ms to 2 ms, and `/wallet` from 39 ms to 2 ms. Proven: `privy.test.ts` 6/6 (one Privy read across three requests, a re-read after five minutes, a failed read not kept, per account, refresh on demand, an invalid token reads nothing), `middleware.test.ts` 4/4 (a Privy session never reaches `agentFor`; an agent key never reaches Privy); after the deploy `wallet-takeover.live.test.ts` 5/5, `strategy-ownership.live.test.ts` 7/7 and `read-failures.live.test.ts` 2/2 against both executors; CI run 34733475637 green |
| 2.2 | **`/agents` (9.4 s).** Prices in parallel, attribute via `strategies.agent_id` instead of scanning audit JSON (`agents/leaderboard.ts:35-58`). Measure | **DONE** — deployed at `031d578`. Measured first: `/agents` answered in 261 ms (Sepolia) and 247 ms (fork) p50 from here — the 9.4 s was not reproducible on the test accounts, whose 30-day record is small (the fork owner: 44 filled runs, WETH and USDC). Fixed anyway, because its cost grew with the trail: each run was credited by searching the wallet's audit log for the run's id inside JSON, prices were fetched one symbol after another, and a run the search missed was credited to Yield Keeper by default. Credit now comes from a join — the agent that owns the strategy (`strategies.agent_id` → `agents.persona_id`), else the persona for its kind, by the rule the executor writes into the trail (`agents/attribution.ts`, moved out of `run.ts`) — prices are fetched in parallel, and a run no persona ran is on nobody's record. After: 268 ms / 274 ms p50. One fork request in 8 took 3.1 s, and a burst a few minutes later took ~3.4 s each: the leaderboard waiting out its 3 s price deadline while the price feed was slow — bounded by design, and back to 0.34 s on re-measure. Locally 64 → 4 ms. Proven: `leaderboard.test.ts` 4/4 (owner, then kind; no default credit; a join, not the audit log; one price per symbol, concurrently, an unpriced symbol left out), `attribution.test.ts` 2/2 |
| 2.3 | **`/positions` (6.3 s).** Dedupe symbols, price in parallel with a deadline; `getPosition` queries one row (`positions/index.ts:225,257`). Measure | **DONE** — deployed at `031d578`. Measured first: `/positions` 268 ms (Sepolia) and 266 ms (fork) p50, p90 558 / 535 ms — not 6.3 s on these accounts, but the book was priced a row at a time with no deadline, so its cost grew with every holding, and `getPosition` priced the whole book to keep one entry. Now one mark per symbol, all at once, with a 4 s deadline (a symbol that misses it reads `feed: unavailable`, as one with no feed already did), and `/positions/:id` reads one row. After: 274 / 273 ms p50, p90 314 / 282 ms; `/positions/:id` answers 200 for the fork's WETH position and 404 for an id not in the book. Locally 37 → 2 ms. Proven: `marks.test.ts` 4/4 |
| 2.4 | **`/wallet/balance` (3.7 s).** Skip the Aave read where Aave does not exist; cache `usdcReserve` 60 s; batch `readPolicy` into one multicall (`evm/balances.ts:131`, `market/yield.ts:115`). Measure | **DONE** — deployed at `031d578`, and this one was real. Measured first: `/wallet/balance` p50 526 ms with a **7,973 ms** p90 on Sepolia, and 361 ms with a **4,158 ms** p90 on the fork. The executors' own logs named the tail — `[rpc] throttled, retrying in 1200ms … 2400ms … 3600ms` at the slow Sepolia request (02:15:05Z) and `1200ms … 2400ms` at the slow fork request (02:17:58Z): the mainnet Aave reserve read, over the free public endpoint, waiting out its back-off. Sepolia paid that read on every balance only to learn it has no Aave. Now there is no reserve read where the chain has no pool (`aavePoolIsDeployedHere`, whose failed check is no longer remembered as "no pool"), the reserve is cached for 60 s (`/verify` still reads it fresh), and `readPolicy` is one multicall instead of three calls. After, over 30 requests each: Sepolia p50 346 ms, p90 511 ms, max 572 ms; fork p50 252 ms, p90 286 ms, max 287 ms; the fork balance still reads 24,999.97 USDC. Locally: p50 1,561 → 790 ms, p90 2,400 → 810 ms. Proven: `balances.test.ts` 3/3, `reserve-cache.test.ts` 4/4, `delegation-read.test.ts` 5/5 |
| 2.5 | **`/delegation` (3.9 s).** One multicall for policy, remaining, spent and venues; basenames in parallel (`routes/index.ts:252-273`). Measure | **DONE** — deployed at `031d578`. Measured first: `/delegation` p50 477 ms (p90 661) on Sepolia and 255 ms (p90 463) on the fork; the permission and its venue list were four reads in two rounds. Now one multicall (`readPolicyAndVenues`); the two basenames were already parallel and cached. After: 354 ms (p90 396) on Sepolia, 263 ms (p90 276) on the fork, answering 1 allowed venue on Sepolia and 3 on the fork with `delegateIsCurrent: true`. Locally 1,048 → 280 ms p50. Proven: `delegation-read.test.ts` — both reads are a single call, and a failed read throws rather than answering with no permission or no venues |
| 2.6 | **Migration 014.** `chain` column on positions, strategies and strategy_runs, filtered by `CHAIN_KEY`; indexes on `strategy_runs(strategy_id,status,finished_at)`, `strategies(wallet_id)`, `strategies(agent_id)`, `proposals(wallet_id,created_at)`, `audit_log((payload->>'runId'))`; delete idempotency rows older than 24 h each tick | **DONE** — deployed at `e75cec6`, as migration **015** (014 was taken by 1.6); Railway's pre-deploy step logged `applied 015-chain-scope.sql` on both executors (02:55:48Z fork, 02:55:52Z Sepolia). `positions`, `strategies` and `strategy_runs` carry `chain`: the pool puts `xorr.chain_key` in every connection's startup packet (`db/index.ts`), each column defaults to it, and every wallet-wide or global read of the three tables filters on it (`db/chain-scope.ts` — the scheduler's due list, `/strategies`, `/runs`, positions and P&L, the leaderboard, alerts, reconcile, fill quality, `/metrics`, `/verify`, the agent surface, news and proposal symbols), as do the by-id strategy lookups; a position is unique per wallet, chain, symbol and side. Existing rows took the migrating executor's chain — an inference each deployed database supports, having served one executor — and the database's own default is set to it for sessions that do not say. Proven the backfill tagged every row: the owner account's `/strategies`, `/runs` and `/positions` and the global `/metrics` tallies are identical before and after on both executors (Sepolia 13 strategies · 6 runs · no positions; fork 75 · 96 · WETH 0.802587) — a row left untagged would have vanished from those filtered reads. After it: `/verify` 19 pass · 1 fail (the permanent audit-chain) · 1 skip on Sepolia, 19 pass · 2 skip on the fork; `wallet-takeover`, `read-failures` and `strategy-ownership` live tests 14/14 on both (they create strategies, so new rows took the default); `strategy-proposal.live.test.ts` 1/1 on the fork (a fill through the per-chain unique index and the chain-scoped strategy update); CI run 34734210592 green. Indexes added: `strategy_runs(strategy_id, status, finished_at)`, `strategies(wallet_id, chain)`, `strategies(agent_id)`, `proposals(wallet_id, created_at)`. **Not added:** `audit_log((payload->>'runId'))` — the leaderboard was the query that needed it, and it no longer searches the trail (2.2), so it would only cost every append. Each scheduler tick deletes `Idempotency-Key` responses older than 24 h. Proven locally first: `chain-scope.live.test.ts` 4/4 against Postgres (the session carries the chain; a strategy and a run written without one take it; one wallet holds the same symbol on two chains while `listPositions`, `applyFill` and `realisedPnl` see and change only their own), scheduler tests 4/4 (the cleanup runs last and a failing cleanup does not fail the tick), server suite 54 files / 349, and the build booted with every dependency up |
| 2.7 | **Positions agree with the chain.** Cap listed units at the chain balance and return the drift; Portfolio shows it | **DONE** — deployed at `a10584f` to both executors and the web app (Vercel `dpl_6CGM19nkjfct2k6nsLhMTuS69Z4j`; the live `index-0e9756cc…js` carries the new copy). `listPositions` and `getPosition` read the wallet's balance of every listed token in one multicall (`chainUnitsOf`), cap the listed units at it — the cost basis scaled with them, so the entry is still what was paid — and return `ledgerUnits`, `chainUnits` and `driftUnits`; a balance read that fails is a 502, never an empty or unchecked book; ledger rows spelled differently from the registry (`CBBTC`) are checked under the registry's name. Assets, Portfolio and the position screen say where the two disagree. Proven on real data: on the fork executor the owner's `/positions` and `/positions/:id` read WETH `units 0 · ledger 0.802586837 · chain 0 · drift 0.802586837 · notional 0` — ledger from before the fork rebuild, which the Portfolio used to price as a holding; and signed in as the same account through xorr's local web app against the local executor, the note renders on Assets, Portfolio and the WETH position ("0.0579 WETH on record is not in your wallet, so size and value show what the wallet holds." — a ledger its Sepolia wallet does not hold). That screenshot also caught a gap, **fixed in the next deploy**: a registry token with no contract at all on the chain (mainnet cbBTC on Sepolia) was listed unchecked at its ledger value — $347 of CBBTC under a $0.00 portfolio value — when nothing can be held there; it now reads 0 held with the drift, and a failed code lookup is no longer cached as unreadable. Tests: `drift.test.ts` 7, `marks.test.ts` 4, `balances.test.ts` (units held, 5), `derived.test.ts` 3 new; live regression 14/14 on both executors; CI run 34734726230 green |
| 2.8 | **Realised P&L from what actually arrived.** Close and flatten read the USDC balance before and after and write a `strategy_runs` row (`routes/panic.ts:131-395`) | NOT STARTED |
| 2.9 | **Fill quality is measured correctly.** Sells compare expected vs measured USDC (today ~0 bps by construction); equity rows tagged; `fillsByVenue` from `strategy_runs.venue`, not audit prose (`executor/fill-quality.ts`, `routes/ops.ts:114-200`) | NOT STARTED |
| 2.10 | **Portfolio history for real graphs.** `portfolio_snapshots` table; scheduler writes one every 15 min and after each fill, close or withdrawal; `GET /portfolio/history?range=1D/1W/1M/ALL` | NOT STARTED |
| 2.11 | `/health` adds breaker state and a subgraph check (with 0.5) | NOT STARTED |
| 2.12 | Notification preferences: the app sends PATCH to a GET/POST route (`src/data/system.ts:446`) — use POST; verify the toggle persists | NOT STARTED |
| 2.13 | Subgraph fetch gets a 5 s timeout (`server/src/graph/client.ts:85`) so it cannot hang a run | NOT STARTED |
| 2.14 | **Server-side stop-all.** `wallets.agents_stopped` + `POST /agents/stop` / `/agents/resume`, passed into `evaluate` (`server/src/rules/engine.ts`) | NOT STARTED |
| 2.15 | Leaderboard scores buys only; agent `risk_limits` enforced as a block reason in `run.ts` | NOT STARTED |
| 2.16 | Watch mode runs the kind's own planner (`run.ts:249-288`) instead of logging a plain buy for every kind | NOT STARTED |
| 2.17 | Onboarding rebalance can be created: accept `PORTFOLIO` with `params.targets` keyed by tradable symbols (`strategies.ts:93-97`) | NOT STARTED |
| 2.18 | Chat context and memory: `/bot/say` gets recent runs and positions as figure-free context; turns persisted to `messages` | **BLOCKED — no LLM credential.** `OPENROUTER_API_KEY` (or any model key) exists in neither `.env` nor Railway, so the model call cannot be verified. The code path answers honestly today (`source: fallback, reason: no_key`) |
| 2.19 | Push delivery to a real device | **BLOCKED — credential.** `eas whoami`: not logged in; no EAS project id; no Firebase config |

## Phase 3 — 1inch: complete, reachable, accounted

| # | Task | Status |
|---|---|---|
| 3.1 | **App grants can reach SwapVM.** Add `SWAPVM_BOOK_ADDRESS` to `SETTLEMENT_VENUES` (`server/src/evm/chains.ts:138-142`); prove a strategy run settles through `swapvm` on the fork under a grant that did not come from `live-swapvm.ts` | NOT STARTED |
| 3.2 | **A fork rebuild keeps the books.** `fork-bootstrap.ts` ships an Aqua book and a SwapVM program (from `live-aqua.ts:130-205`, `live-swapvm.ts`), deploys `XorrAuditAnchor`, funds the deployed delegate; add `npm run rebuild:fork`. Prove on a local anvil fork end to end | NOT STARTED |
| 3.3 | Fork state survives restarts: commit `infra/base-fork/Dockerfile` (`anvil --state` on a volume) and move the `base-fork` service to it after 3.2 is proven | NOT STARTED |
| 3.4 | `settle.ts` honours `preferred === '1inch'` only when the Aqua index is configured — today a delegation index can silently skip both books (`graph/decide.ts:72-73`) | NOT STARTED |
| 3.5 | `/graph/decision` passes `aquaApp`, `tokenOut`, `amountOut` and `ADDRESSES.usdcBase` (`routes/extra.ts:484-500`) | NOT STARTED |
| 3.6 | `/route/compare`: Aqua detail prints `[object Object]` (`venues/compare.ts:208`); aggregator gas counts only the router, books count the full `spend()` — estimate both the same way; export the ranking for a real test | NOT STARTED |
| 3.7 | `/market/tradable` returns `[]` where `CAN_SETTLE` is false so Buy is disabled on Sepolia instead of failing (`routes/market.ts:352`) | NOT STARTED |
| 3.8 | Unit tests: `oneinch.test.ts` (query strings, AMM list on fork only), `settle.test.ts` (venue order Aqua → SwapVM → 1inch → aave), `aqua.test.ts` | NOT STARTED |
| 3.9 | **Swap, for real.** Rebuild `app/swap.tsx`: token picker over `/market/tradable` with Token API metadata, slippage wired into `/swap/quote`, route and fee rows; new `POST /swap` running a one-shot intent through `chooseSettlement` under the permission. Prove a real swap on the fork from the screen's own request | NOT STARTED |
| 3.10 | **Tokens and balances.** `GET /wallet/tokens` — 1inch Balance API on Base, multicall where the chain is a fork or testnet; a tokens section in Wallet | NOT STARTED |
| 3.11 | **Send any held token** with per-token decimals and a fee row (`app/send.tsx`, `src/wallet/useWithdraw.ts`) | NOT STARTED |
| 3.12 | **Approvals include the 1inch router** (`/swap/v6.0/8453/approve/allowance`) and a Revoke button (`app/approvals.tsx`) | NOT STARTED |
| 3.13 | **Fees shown.** Gas price (1inch Gas Price API on Base; `getGasPrice` on the fork) in `/swap/quote`; fee rows on swap, order and send | NOT STARTED |
| 3.14 | **Transaction history.** 1inch History API on Base; `Spent`/`Closed` logs on fork and Sepolia; one History screen | NOT STARTED |
| 3.15 | **Limit orders.** Limit Order Protocol orders built and filled locally on the fork (`fillOrder`), listed in the app | NOT STARTED — posting to the public 1inch orderbook is a mainnet action and stays out |
| 3.16 | **Cross-chain quote.** Fusion+ quoter (`/fusion-plus/quoter/v1.0/quote/receive`) as a read-only screen | NOT STARTED — submitting is a mainnet action and stays out |
| 3.17 | Portfolio value from the 1inch Portfolio API | **BLOCKED — no data.** It indexes real Base only; the test wallets hold nothing there. 2.10's snapshots replace it |
| 3.18 | `docs/SPONSOR-AUDIT.md` 1inch section regenerated from the code (stocks priced by the swap quote, not Spot Price; fill counts; SwapVM); `/market/stocks` sends `feed:'unavailable'` not `'simulated'` | NOT STARTED |
| 3.19 | Manual-dispatch CI job for live 1inch tests and forge fork tests, with repo secrets set from the existing `.env` names | NOT STARTED |

## Phase 4 — Wallet and Privy: a loop a stranger can finish

| # | Task | Status |
|---|---|---|
| 4.1 | **Spike: user signing on the fork.** Privy simulates embedded-wallet sends against real Base (`src/chain.ts:66-88`). In `src/auth/useGrantDelegation.{native,web}.ts`, sign with `eth_signTransaction` using fork nonce/gas and broadcast the raw transaction to the fork RPC. Decision gate: works → 4.2; fails → record Privy's error verbatim and do 4.3 | NOT STARTED |
| 4.2 | If 4.1 works: a fork web build (`EXPO_PUBLIC_XORR_CHAIN=base-fork`) is the hosted demo, so grant → fill → withdraw completes in one place | NOT STARTED |
| 4.3 | A Home banner states plainly when the connected chain cannot fill | NOT STARTED |
| 4.4 | **New wallets can get test funds.** Fork: an executor faucet sends fork USDC to a verified wallet. Sepolia: settlement-token USDC from a treasury key, if one holds any; otherwise state it | NOT STARTED |
| 4.5 | **Deposit screen** `app/deposit.tsx`: QR, copy, balance polling, faucet action; no mainnet QR on fork builds (`app/(onboarding)/fund.tsx:188` encodes chain 8453); Portfolio and Agent point here, not at onboarding | NOT STARTED |
| 4.6 | After a chain switch, read `eth_chainId` and stop with a stated error if it is wrong (`useGrantDelegation.*:79-102`) | NOT STARTED |
| 4.7 | Resume re-grants with the on-chain cap and previous duration and skips approvals already sufficient (`app/safety.tsx:216-260`) | NOT STARTED |
| 4.8 | `/delegation/record` decodes the `Granted` event (owner must equal the wallet) and stores `allowedVenues()` (`routes/index.ts:487-522`) | NOT STARTED |
| 4.9 | **Withdraw for real.** Server-side allowlist with a server clock for the cooling-off and a remove action (SECURITY.md itself requires it); any token; "withdraw everything" sequences sell → Aave exit → send. Prove one user-signed withdrawal on chain | NOT STARTED |
| 4.10 | Wallet export in `app/recovery.tsx` via Privy, where the SDK supports it; fix the onboarding copy that asks for a backup nothing offers | NOT STARTED |
| 4.11 | Login copy matches reality (the passkey comment promises a login that is not built) | NOT STARTED — enabling passkeys needs Privy dashboard and `associatedDomains` (8.9) |
| 4.12 | Privy wallet selection and caching (with 2.1) | NOT STARTED |
| 4.13 | Privy policy on the user's own wallet: find the owner-authorised attach path; if none exists, remove "Ready, and yours to switch on" (`app/safety.tsx:436-441`) | NOT STARTED |
| 4.14 | **The B2B workflow.** A concrete, working business flow built on the key-quorum policy (operator manages agent policy for a business wallet), shown in-app and written up | NOT STARTED |

## Phase 5 — UI: simpler and cooler

| # | Task | Status |
|---|---|---|
| 5.1 | **More tab** (`app/(tabs)/more.tsx`, blank today): Wallet (tokens, swap, send, deposit), Strategies, Activity, Alerts, Futures, Earn, Proof (verify, judge, delegation, approvals, audit), Settings — as tiles in the new language | NOT STARTED |
| 5.2 | **Fold the long tail.** Merge activity + inbox + runs + proposals + history + catchup; retire orphaned or duplicate screens (`watchlist`, `chart/[s]`, `(tabs)/markets`, `markets/[classId]`, `search`, `briefing`, `bot/*`, `holdings`, `balance`, `allocation`, `pnl`, `rates`, `roster-compare`, `risk`, `backtest`, `schedule`, `movers`, `tokens`, `coverage`, `compare`, `basename`, `goals`, `CatchUp.tsx`); update `src/qa/audit.test.ts` and `tools/shoot.mjs` | NOT STARTED |
| 5.3 | **No fixtures on screen.** Remove the agent roster fallback (`src/data/local.ts:189-199`), the goals step (`app/(onboarding)/goals.tsx`), the sleeves proposal (`proposal.tsx`) in favour of a first-strategy step, and the 27 unpriced instruments (`src/data/fixtures/markets.ts:272-619`) | NOT STARTED |
| 5.4 | **Errors look like errors.** Home (prices, limits), Portfolio (positions, runs — skeletons pulse forever on failure), inbox, alerts, position (404 vs failure); exports on web use `deliverFile` | NOT STARTED |
| 5.5 | **Fresh numbers.** Home and Portfolio reload on focus and on pull (a refresh control on web) | NOT STARTED |
| 5.6 | **Hiring does something.** Hire opens a create-strategy sheet with `agentId`; errors are shown; ladder tiers 6–7 get setup screens or `available:false`; exit rules route to a position | NOT STARTED |
| 5.7 | **False claims.** Order ticket's "Auto Close is on" (arm exit rules after a fill, or remove); asset 1Y = 365 days and All = max (both fetch 90 today); star persisted or removed; TP/SL limits widened; auto-close load error branch | NOT STARTED |
| 5.8 | **Charts.** Candles carry timestamps; line views not folded to 12 points; drag crosshair with price and time plus an accessible summary; fill markers on asset and position charts; Portfolio graph from `/portfolio/history` with range pills ending at the balance; agent P&L chart | NOT STARTED |
| 5.9 | **One visual language.** Restyle the kept old-design screens: safety, activity, settings, send, deposit, order, position, strategy set-ups, onboarding | NOT STARTED |
| 5.10 | Chat: remove the dead "Conversation options" button; skip/decline messages use the proposal's own symbol and agent; delete unused builders | NOT STARTED |
| 5.11 | **Accessibility.** Secondary text at least `ink55` on black (ink28–45 is 2.3–4.4:1); header roles; web modal `aria-modal` and Escape; labelled skeletons and charts | NOT STARTED |
| 5.12 | Stocks rows open the asset screen with the observed series when there are no candles | NOT STARTED |
| 5.13 | Design docs match the approved motion (`ui/mobile-ui/animations.md`, `src/ui/README.md` rule 3) — the owner directed arrival motion from the reference video | NOT STARTED |
| 5.14 | Tab bar testIDs for e2e | NOT STARTED |

## Phase 6 — Tests and CI depth

| # | Task | Status |
|---|---|---|
| 6.1 | Chain-and-database integration tests (local anvil + Postgres) for settle, spend, withdraw calldata, reconcile, flatten and idempotency; a CI job with both services | NOT STARTED |
| 6.2 | Lint `server/` in CI; Prettier check; checkout/setup-node v5 | NOT STARTED |
| 6.3 | Maestro flows rewritten for the current shell (`e2e/*.yaml`), plus `npm run e2e` | NOT STARTED |
| 6.4 | Live-test prerequisites documented in `docs/TESTPLAN.md` | NOT STARTED |
| 6.5 | Screenshot harness covers `/more`, `/futures` and the new screens; regenerate `docs/screens` | NOT STARTED |
| 6.6 | Delegation subgraph: `Closed` handler and matchstick tests (with 1.5) | NOT STARTED |
| 6.7 | Forge in CI runs every non-fork suite (today only `XorrDelegationTest`); fork job with a pinned `FORK_BLOCK` | NOT STARTED |
| 6.8 | Anchor live test on Sepolia with a scratch wallet | NOT STARTED |

## Phase 7 — Docs, demo and submission

| # | Task | Status |
|---|---|---|
| 7.1 | README: setup runs migrations (`npm --prefix server run migrate`), counts refreshed, screenshot gallery refreshed, architecture linked, a judge walkthrough, claims corrected (fork receipts for tiers 1–6, one live subgraph, policy proven on a demo wallet) | NOT STARTED |
| 7.2 | `docs/SUBMISSION.md`: the Privy B2B use case and workflow, financial-flow transaction hashes, track claims matching the code | NOT STARTED |
| 7.3 | `docs/RUNBOOK.md` and `docs/SECURITY.md` rewritten for the EVM design (they still describe Solana), with deploy and migrate steps | NOT STARTED |
| 7.4 | Stale docs corrected or dated as historical: TESTPLAN-*, DEMO.md counts, COMPLETION.md, ARCHITECTURE (7 kinds), e2e README, BASE-BUILD-CAMP (62 contract tests, not on mainnet) | NOT STARTED |
| 7.5 | 107 code comments cite section numbers from a different project's plan (`xorr-dev/PLAN.md`) — re-point them; remove the three `docs/QA-UI-PLAN.md` references (the file never existed) | NOT STARTED |
| 7.6 | **Demo video, 2–4 minutes**, against the deployed app, with an on-chain transfer on screen and narration (macOS `say` + `ffmpeg`); update README and SUBMISSION links | NOT STARTED |
| 7.7 | Deadline and official brief links at the top of SUBMISSION | **BLOCKED — owner.** Not in the repo; the ETHGlobal pages list no dates |

## Phase 8 — Blocked on an external thing

| # | Item | Blocked on |
|---|---|---|
| 8.1 | `XorrDelegation` on Base mainnet; Base Build Camp | Real money — deployer `0x364d…2581` holds 0 ETH on Base |
| 8.2 | One tokenized-equity fill | Real money on mainnet; equities do not function on a fork |
| 8.3 | The Graph track (`xorr-aqua` slug) | A Studio login with a wallet signature in a browser — an owner action |
| 8.4 | x402 Gateway queries | Spends mainnet USDC |
| 8.5 | LLM chat answers | No model key anywhere (2.18) |
| 8.6 | Push notifications, TestFlight | Expo account login, EAS project, Firebase config, Apple account |
| 8.7 | Explorer verification through an API key | No `ETHERSCAN_API_KEY`; Sourcify is used instead (1.5) |
| 8.8 | Circle USDC from the Sepolia faucet | Captcha-gated |
| 8.9 | Passkeys, Privy allowed origins | Privy dashboard access |
| 8.10 | The crashed, unreferenced Railway `Postgres` service | Deleting a database is the owner's call |
| 8.11 | Fusion, Fusion+ and orderbook order submission | Mainnet actions |
| 8.12 | Sepolia audit chain forked at entry 2 | Permanent by design — append-only |

---

## 3. The gap list

Every gap found, tied to the task that closes it. Severity is for the product and the submission.

| ID | Gap | Where | Task | Severity |
|---|---|---|---|---|
| X1 | Any signed-in user can take over any wallet row, then trade, close or flatten on that owner's permission | `routes/index.ts:88,154-172` | 1.1 | **Critical** — **closed** (1.1, `80a8c62`, verified on both executors) |
| X2 | Swap output is not bound to the owner on chain; `closePosition` uncapped — a leaked delegate key could drain approved tokens | `XorrDelegation.sol:179,232`; books | 1.4 | **Critical** — **closed** (1.4, `47b1296`; deployed and proven with real fills in 1.5) |
| X3 | Strategy pause/resume/end/patch/delete have no ownership check | `routes/strategies.ts:592-665` | 1.2 | **High** — **closed** (1.2, `fbaa2c5`, verified on both executors) |
| X4 | Approving a proposal writes "Filled…" and trades nothing | `routes/extra.ts:289-339`; `Chat.tsx:314-330` | 1.3 | **High** — **closed** (1.3, `400d64e`; real fill on the fork) |
| X5 | Sepolia contract predates the source (no `closePosition`); nothing verified; no deploy record | `0xb14C…0a4e` | 1.5 | **High** — **closed** (1.5; `0x6c55…540e` deployed, Sourcify exact match, deployment record committed) |
| X6 | One RPC error mid-run leaves it pending and aborts the tick; failed runs starve newer ones | `run.ts:299-365`; `scheduler.ts` | 1.6 | **High** — **closed** (1.6, `d76845a` + `31226d7`; fork overdue strategies 4 → 0) |
| X7 | Failed chain reads shown as `$0`, no delegation, or revoked | `routes/index.ts:223-226,261,390,864-870` | 1.7 | **High** — **closed** (1.7, `31226d7`; verified on both executors) |
| X8 | Gas faucet drainable and races into double sends | `gasDrip.ts`; `routes/index.ts:163-211` | 1.8 | Medium — **closed** (1.1 + 1.8, `a3a3247`; a first visit paid by the faucet, not the delegate) |
| X9 | Privy policy matches only `to`, so a token transfer to an attacker passes | `privyPolicy.ts:181-189` | 1.9 | Medium — **closed** (1.9, `3989ef9`; Privy refuses the transfer, a grant to a stranger and an unlisted send on both executors) |
| X10 | Momentum and event-driven would trade without approval | `ladder.ts:99` | 1.10 | Medium — **closed** (1.10, `3989ef9`; a strategy's proposal approved and filled on the fork) |
| X11 | CORS `*` in production | executors | 1.11 | Medium — **closed** (1.11; a foreign-origin preflight is refused on both executors) |
| X12 | Anchor route spends bot gas without a limit | `routes/index.ts:830` | 1.12 | Low — **closed** (1.12, `3989ef9`; a second press inside the hour answered 429) |
| X13 | Every authenticated request pays ~0.45 s before its handler | `middleware.ts:95`; `privy.ts:59` | 2.1 | Medium — **closed** (2.1, `031d578`; measured +14–17 ms on the deployed executors, not 0.45 s, and now within noise — no agent-key write or Privy read per request) |
| X14 | `/agents` 9.4 s, `/positions` 6.3 s, `/wallet/balance` 3.7 s, `/delegation` 3.9 s | see 2.2–2.5 | 2.2–2.5 | Medium — **closed** (2.2–2.5, `031d578`; the reproducible cost was `/wallet/balance`'s throttled Aave read — p90 7,973 → 511 ms on Sepolia, 4,158 → 286 ms on the fork; the other routes were already fast on these accounts and no longer grow with the book or the trail) |
| X15 | Positions ledger never checked against the chain and not tagged by chain — Portfolio shows `$0.00` beside open positions | `positions/index.ts:201-250` | 2.6, 2.7 | **High** |
| X16 | Realised P&L uses the pre-trade estimate; closes/flattens leave no run row | `panic.ts:131-395` | 2.8 | Medium |
| X17 | Sells score ~0 bps by construction; `fillsByVenue` parses prose | `fill-quality.ts`; `ops.ts` | 2.9 | Medium |
| X18 | No stored portfolio history; the graph replays today's holdings | `app/portfolio.tsx:70-146` | 2.10, 5.8 | **High** (bar 3) |
| X19 | Notification toggles send PATCH to a POST route and fail silently | `src/data/system.ts:446` | 2.12 | Low |
| X20 | Subgraph fetch can hang a run | `graph/client.ts:85` | 2.13 | Low |
| X21 | No server-side stop-all | `rules/engine.ts` | 2.14 | Medium |
| X22 | Leaderboard scores sells and supplies as buys; `risk_limits` not enforced | `leaderboard.ts`; `agents/routes.ts:172` | 2.15 | Low |
| X23 | Watch mode ignores each kind's planner | `run.ts:249-288` | 2.16 | Low |
| X24 | Onboarding rebalance can never be created (400) | `proposal.tsx:68-76`; `strategies.ts:93-97` | 2.17 | Medium |
| X25 | Chat has no context or memory | `bot/llm.ts` | 2.18 | Blocked |
| X26 | Push never registers | `app.json` | 2.19 | Blocked |
| X27 | App grants cannot reach the SwapVM book | `chains.ts:138-142` | 3.1 | **High** (1inch track) |
| X28 | Fork rebuild loses the books and the anchor; recovery is manual | `fork-bootstrap.ts` | 3.2, 3.3 | **High** |
| X29 | A configured delegation index can silently skip both books | `graph/decide.ts:72-73`; `settle.ts` | 3.4 | Medium |
| X30 | `/graph/decision` can never show Aqua; hardcodes mainnet USDC | `routes/extra.ts:484-500` | 3.5 | Low |
| X31 | Route compare prints `[object Object]` and costs venues unevenly | `venues/compare.ts:170-208` | 3.6 | Medium |
| X32 | Buy enabled on Sepolia, then fails | `routes/market.ts:352` | 3.7 | Medium |
| X33 | No unit tests for the 1inch client, venue order, or Aqua | server | 3.8 | Medium |
| X34 | Swap is a dead screen (fixed pair, controls do nothing, review opens a sell) | `app/swap.tsx` | 3.9 | **High** (owner ask) |
| X35 | No token list with balances | `app/tokens.tsx` | 3.10 | Medium |
| X36 | Send is USDC only, no fee | `app/send.tsx` | 3.11 | Medium |
| X37 | Approvals omit the 1inch router and cannot revoke | `app/approvals.tsx` | 3.12 | Medium |
| X38 | No fee estimate anywhere a user pays one | swap, order, send | 3.13 | Low |
| X39 | No wallet-level transaction history | `app/history.tsx` | 3.14 | Medium |
| X40 | No limit orders | — | 3.15 | Medium |
| X41 | No cross-chain | — | 3.16 | Low |
| X42 | SPONSOR-AUDIT contradicts itself and the code | `docs/SPONSOR-AUDIT.md` | 3.18 | Medium |
| X43 | Core loop cannot complete on any single hosted chain | `src/chain.ts:66-88` | 4.1–4.3 | **Critical** (bar 5) |
| X44 | New wallets have no USDC and no way to get any | `fund.tsx` | 4.4, 4.5 | **High** |
| X45 | Fork build's deposit QR points at real Base | `fund.tsx:188` | 4.5 | Medium |
| X46 | Chain switch failure is swallowed | `useGrantDelegation.*` | 4.6 | Medium |
| X47 | Resume re-grants a default cap for 24 h | `safety.tsx:216-260` | 4.7 | Medium |
| X48 | `/delegation/record` trusts any successful transaction | `routes/index.ts:487-522` | 4.8 | Medium |
| X49 | Withdrawal allowlist and cooling-off live only on the device; USDC only | `allowlist.ts`; `useWithdraw.ts` | 4.9 | **High** |
| X50 | No wallet export; onboarding asks for a backup nothing offers | `recovery.tsx`; `wallet.tsx` | 4.10 | Medium |
| X51 | Privy policy not on any user wallet; copy implies a switch that does not exist | `privyPolicy.ts`; `safety.tsx:436-441` | 4.13 | Medium |
| X52 | No written or working B2B workflow | SUBMISSION | 4.14, 7.2 | **High** (Privy track) |
| X53 | More tab blank; 41 screens behind Explore; 13 orphaned | `app/` | 5.1, 5.2 | **High** (bar 6) |
| X54 | Fixture agents, goals, sleeves and 27 unpriced instruments on screen | `local.ts`; fixtures | 5.3 | **High** (bar 3) |
| X55 | Failures render as empty states or endless skeletons | Home, Portfolio, inbox, alerts | 5.4 | Medium |
| X56 | Home and Portfolio never refresh | `(tabs)/index.tsx` | 5.5 | Medium |
| X57 | Hiring starts nothing; ladder tiers 6–7 loop back to themselves | `agent/[id].tsx`; `ladder.ts` | 5.6 | Medium |
| X58 | "Auto Close is on" without exit rules; 1Y and All both 90 days | `order/[symbol].tsx:347-356`; `marketData.ts:189-195` | 5.7 | Medium |
| X59 | Charts have 12 points, no timestamps, no scrubbing | charts | 5.8 | Medium |
| X60 | Two visual languages | old-design screens | 5.9 | Medium |
| X61 | Contrast below 4.5:1; no header roles | `tokens.ts:102-108` | 5.11 | Medium |
| X62 | CI has never passed (install conflict) | `package.json` | 0.2–0.4 | **High** — **closed** (run 34727643070) |
| X63 | Deployed web bundle is pre-redesign; `/health` has no version | Vercel, executors | 0.5–0.7 | **High** |
| X64 | ~80 files uncommitted (1inch requires a real commit history) | working tree | 0.1 | **High** |
| X65 | `.env.example` missing 18 names; ignore-file holes | `.env.example`; `.gitignore` | 0.9 | Low |
| X66 | No executor tests on settle, spend, withdraw, reconcile, flatten | server | 6.1 | **High** |
| X67 | Maestro flows target screens that no longer exist | `e2e/` | 6.3 | Medium |
| X68 | README setup skips 13 migrations; stale counts | `README.md` | 7.1 | Medium |
| X69 | RUNBOOK and SECURITY describe the old Solana design | `docs/` | 7.3 | Medium |
| X70 | 107 comments cite another project's plan | `app/`, `src/`, `server/src` | 7.5 | Low |
| X71 | Demo 91 s, silent, no fill, pre-redesign | `docs/demo/` | 7.6 | **High** |

### Mock / stub / TODO sweep

Zero TODO, FIXME or "not implemented" markers in shipped code. Hundreds of keyword hits were
classified; almost all are the `Placeholder` skeleton primitive, input placeholders, tests, or comments
describing a mock that was removed. **The real ones are not marked in the code at all:**

- Approving a proposal writes a fill that never happened — X4
- Agent roster falls back to four fixture agents with $0 stats — X54
- Onboarding goals and sleeves are design fixtures, and the sleeves drive a real strategy — X54, X24
- 27 unpriced instruments listed — X54
- Watch mode logs a plain buy for every kind — X23
- "Auto Close is on" printed without exit rules — X58
- `/market/stocks` labels an unrouted stock `feed:'simulated'` — 3.18

---

## 4. Current measured state — 2026-09-13

| Check | Result |
|---|---|
| HEAD | `8def793`, in sync with `origin/main`; ~80 files uncommitted |
| `https://app.xorr.finance` | 200 — bundle built 2026-09-12 06:18 UTC, **pre-redesign**, calls `executor-production-1659` |
| Old hosted URL (`web-production-3e214`) | 404 |
| `api.xorr.finance/health` | up · base-sepolia · delegation `0xb14C…0a4e` (7,157 bytes) · postgres up · gas 0.048 ETH |
| `api.xorr.finance/market/futures` | **401** — route not deployed |
| Sepolia `/verify?owner=0x95A0…e615` | **19 pass · 1 fail · 1 skip** |
| Sepolia `/metrics` | runs: 3 blocked, 1 skipped, 7 failed, **0 filled** |
| Fork `/health` | up · base-fork · delegation `0xf47a…b6d7` (3,926 bytes) · gas 9.999 ETH |
| Fork `/verify` (no owner) | 14 pass · 0 fail · 7 skip |
| Fork `/metrics` | 41 filled, 31 failed, 8 skipped, 6 blocked · `swapvm 4 · 1inch 36 · aqua 7` · Aqua fills −310 bps vs quote, SwapVM +73 bps |
| Sepolia delegation bytecode | has `grant`, `revoke`; **no `closePosition`** |
| Deployer `0x364d…2581` | Sepolia 0.109 ETH · Base mainnet 0 ETH |
| CI (GitHub Actions) | **Green** from run 34727643070 (`80a8c62`, 2026-09-13); every run before it failed at Install |
| App tests (`npm test`, includes server) | 61 files · **558 pass** |
| Server tests (`cd server && npm test`) | 37 files · **277 pass** |
| Contract tests | 62 (22 + 8 + 15 + 10 + 7) |
| Typecheck | clean, both projects |
| Credentials present (names) | `ONEINCH_API_KEY`, `PRIVY_APP_ID/SECRET`, `GRAPH_DEPLOY_KEY`, `BASE_RPC`, `BASE_SEPOLIA_RPC`, `.keys/deployer.key`; on Railway also `DELEGATE_PRIVATE_KEY`, `PRIVY_AUTHORIZATION_KEY`, `PRIVY_KEY_QUORUM_ID`, `OPERATOR_TOKEN` |
| Credentials absent | any LLM key, `ETHERSCAN_API_KEY`, Expo/EAS login, Firebase config |

---

## 5. What changed since the fourth plan

- **The product moved.** The Railway web service is gone; the app is `app.xorr.finance` on Vercel, the
  executor `api.xorr.finance`. The fourth plan's hosted URL is dead.
- **A redesign landed locally and nowhere else:** a three-button shell (Home, a chat button, a grid
  tab), one balance on Home opening Portfolio, arrival motion from the owner's reference video, new
  back and close buttons, a simpler Profile, and Futures and Stocks backed by real market data
  (Hyperliquid, 1inch quotes). None of it is committed or deployed.
- **The audits looked at security, not just honesty,** and found what the fourth plan could not: a
  wallet takeover, an unowned strategy endpoint, a contract promise nothing enforces, and a fill
  written for a trade that never happened.
- **The owner's asks widened:** simpler and cooler UI, every 1inch wallet feature end to end, the Privy
  wallet and the graphs made properly — Phases 3–5.
