# xorr — build plan

Planning only. Nothing here was built as part of writing it; every status reflects the repository at
commit `1332eab`, checked by running things rather than by reading the last plan.

Written for an agent to pick up cold: every task names the file, the symbol, and what done means.

**This is the third plan.** The previous two have been executed — 17 commits since the last one —
and most of what they contained is finished. That changes the shape of this one: it is short on
building and long on the two things actually left, which are a **product lie about equities** and a
**demo that does not exist**.

---

## 1. What done and winning mean here

The claim the whole project serves, unchanged:

> **A bot trades your capital under a permission you granted on-chain, that you can read and revoke
> without our cooperation — and every number the app shows you can be checked somewhere we do not
> control.**

**Done** means all five hold at once. Four do.

| # | Bar | State |
|---|---|---|
| 1 | The permission is real — deployed contract, user-signed grant, cap/expiry/venue enforced on chain, revoke needs nothing from us | **Holds.** Verified this week end to end: `revoked: true` then `false` read straight off Base Sepolia |
| 2 | The bot actually trades — all seven ladder tiers plan real intents and settle on chain | **Holds for crypto.** All 7 tiers have fired with transaction hashes. **Does not hold for tokenized equities** |
| 3 | Nothing on screen is invented | **Holds** — with one exception, see Phase 1 |
| 4 | A stranger can check it — `/verify` and `/judge` re-run every claim live | **Holds.** Fork 18/0/1, Sepolia 16/1/2 |
| 5 | Someone can watch it work in two minutes | **Does not hold.** There is no recording |

**Winning** is a separate bar set by the sponsor tracks:

| Track | Bar | State |
|---|---|---|
| 1inch — Aqua App | Official Aqua/SwapVM contracts used, real on-chain transfers | **Met.** Real Aqua fills; SwapVM now wired as a venue rather than an artefact |
| Privy — B2B Financial Product | Privy core, ≥1 wallet, ≥1 Privy control | **Met.** Policy owned by key quorum `zixx49ik…`, refusal proven live |
| Privy — Best Financial Flow | ≥1 completed financial flow | **Met.** Swap, Aave deposit, user-signed USDC withdrawal |
| The Graph — Composable/Standardized | Two or more Graph products, or a standardized schema | **Not met.** One subgraph is ever queried |

Three of four tracks are met. The fourth is blocked on a dashboard click, re-confirmed today.

**The honest summary:** the software is finished. What is missing is a two-minute video and one
screen telling the truth about which assets this deployment can trade.

---

## 2. Phases

Short, because most of the work is done. Ordered by what a judge would notice first.

| # | Phase | Why |
|---|---|---|
| 1 | **Stop offering trades that cannot fill** | The app currently offers a Buy button for eight assets it cannot settle |
| 2 | **Prove the equity path on the chain where it works** | The tokens are live and busy on real Base; only the fork cannot run them |
| 3 | **The demo** | Every track asks for 2–4 minutes of video. There is none |
| 4 | **The Graph composability** | The only unmet track |
| 5 | **Remaining blocked items** | Documented, each with the specific external thing it waits on |

---

## Phase 1 — Stop offering trades that cannot fill

**The gap, measured today.** `GET /market/tradable` on the fork returns all eight equities:

```
['ETH','WETH','USDC','CBBTC','NVDAc','AAPLc','TSLAc','METAc','MSFTc','AMZNc','GOOGLc','MSTRc']
```

`isTradable('NVDAc')` is therefore `true`, so `/order/NVDAc` renders a complete ticket — live price,
unit conversion, an enabled **"Buy $250 of NVDAc"** — and the fill reverts `TF`. The app makes a
confident offer it cannot honour, which is the exact failure mode the rest of the codebase is built
to avoid. It is also the one remaining place where something on screen is not true.

The cause is that tradability is decided by the token registry, not by whether the token *works* on
the running chain. `/verify` already knows the difference: its `equities` check calls
`totalSupply()` and correctly skips on a fork. `/market/tradable` does not ask.

| # | Task | Status |
|---|---|---|
| 1.1 | Add a cached `equitiesFunctional()` to `server/src/venues/stocks.ts` that calls `totalSupply()` on one equity and caches the answer for the process lifetime — the chain does not change underneath a running executor. Reuse the logic `/verify`'s `equities` check already has. | **NOT STARTED** |
| 1.2 | `GET /market/tradable` (`server/src/routes/market.ts`) filters equities out when `equitiesFunctional()` is false. Definition of done: on the fork the response contains only `ETH, WETH, USDC, CBBTC`; on a hypothetical mainnet deployment it contains all twelve. | **NOT STARTED** |
| 1.3 | `/order/:symbol` must then refuse an equity on a fork the way it already refuses an untradable symbol — `app/order/[symbol].tsx:56` has the branch and the copy, it simply never fires because `isTradable` says yes. Verify in the browser that `/order/NVDAc` shows the refusal rather than a Buy button. | **NOT STARTED** |
| 1.4 | `POST /strategies` must refuse `symbol: 'NVDAc'` on a fork with a reason naming the chain, not accept it and fail at run time. Today it accepts and the run fails with `TF`. | **NOT STARTED** |
| 1.5 | `/markets/stocks` should still LIST the equities with their real prices — the price is genuine and the screen is a market list, not an order form — but say plainly that this deployment cannot settle them. One line, in the copy voice already used for "Prices are indicative". | **NOT STARTED** |
| 1.6 | Add a `/verify` check `equities-tradable` asserting the two agree: if `equitiesFunctional()` is false then `/market/tradable` must not list one. This is the invariant that was silently violated. | **NOT STARTED** |

---

## Phase 2 — Prove the equity path where it works

The equity tokens are not broken; the fork is. Evidence gathered today:

- `totalSupply()` on real Base returns 1,373,108,020,000 for NVDAc; the same call on an anvil fork of
  the same block **reverts**. They carry one byte of code, so whatever serves them is below the
  bytecode and a fork copies the byte and nothing else.
- **2,907 NVDAc Transfer events in the last 4,000 blocks** on real Base. The token is live and busy.

So "equities do not work" is false; "equities do not work *here*" is true. That distinction is worth
demonstrating rather than asserting, and it can be done read-only.

| # | Task | Status |
|---|---|---|
| 2.1 | Add `server/src/equity-mainnet-proof.ts` (a script, not a route): against `BASE_RPC` read `totalSupply()`, `decimals()` and `symbol()` for all eight, count recent Transfer logs, and fetch a live 1inch quote for `USDC → NVDAc`. Print a table. No transaction, no spend. | **NOT STARTED** |
| 2.2 | Extend the `equities` check in `server/src/verify/checks.ts` so its SKIP message on a fork cites the mainnet evidence — "live on Base: N transfers in the last 4,000 blocks; not reproducible on a fork" — rather than only saying it cannot work here. | **NOT STARTED** |
| 2.3 | A README paragraph under the two-environment section stating exactly this, so the next reader does not conclude the feature is fictional. | **NOT STARTED** |
| 2.4 | An actual equity fill on Base **mainnet**. | **BLOCKED — spends real money.** The code path is proven up to settlement; completing it means a real swap with real USDC. Needs an explicit decision, not an assumption. |

---

## Phase 3 — The demo

Every sponsor track asks for a 2–4 minute video. There is none, and no recording exists anywhere in
the repo. This is now the highest-value remaining work: three of four tracks are already met and
cannot be judged without it.

| # | Task | Status |
|---|---|---|
| 3.1 | Write `docs/DEMO-SCRIPT.md`: the exact click path and the sentence said over each beat. Suggested spine — sign in with Privy → grant the permission (show the wallet asking, and the cap/expiry/venues in the sheet) → create a recurring buy → run it and watch a real fill land with a tx hash → open `/judge` and re-run every claim live → revoke, and show `revoked: true` on BaseScan. Under two minutes. | **NOT STARTED** |
| 3.2 | Record it against the **fork** deployment, where fills actually settle. `EXPO_PUBLIC_API_URL=https://executor-fork-production.up.railway.app`, app at `localhost:8082`, viewport 402×874 to match the design canvas. | **NOT STARTED** |
| 3.3 | A 60-second silent GIF of the same path for the README top, since a reader will not click a video. | **NOT STARTED** |
| 3.4 | Link both from `README.md` above "Check it yourself", and from each track section of `docs/SUBMISSION.md`. | **NOT STARTED** |
| — | `docs/SUBMISSION.md` — one section per track, each pointing at a hash or a live endpoint. | **DONE** (149 lines) |

---

## Phase 4 — The Graph composability

The only unmet track. Re-tested today, not assumed: `graph deploy xorr-aqua` uploads the build to
IPFS successfully (`QmctadHCDBprb9Q1Pq4oyMXjB6KcnUDHRheDRNyBA59tAJ`) and then fails
**`Subgraph not found`**. The slug must exist before a deploy, and creating it is a Studio dashboard
action with a wallet signature. `subgraph_create` is not exposed on the deploy API.

| # | Task | Status |
|---|---|---|
| 4.1 | Create the `xorr-aqua` slug at thegraph.com/studio with the deployer wallet, then `cd subgraph-aqua && npx graph deploy xorr-aqua --deploy-key $GRAPH_DEPLOY_KEY --version-label v0.0.1`. The build is already pinned; only the slug is missing. | **BLOCKED — needs a browser and the deployer wallet.** Re-confirmed today |
| 4.2 | Set `AQUA_SUBGRAPH_URL` on both Railway services; confirm `/graph/decision` stops reporting "No Aqua book index configured". | **BLOCKED** by 4.1 |
| 4.3 | x402 Gateway queries — mechanism verified (`402`, `eip155:8453`, 0.01 USDC per query, EIP-3009 via a `Payment-Signature` header). Composes our Studio subgraph with the Gateway: two products, no dashboard needed. | **BLOCKED — spends real mainnet USDC.** Roughly an hour once approved |
| 4.4 | Make the composition visible on `/judge` — show the two sources and which one moved the decision — once 4.1 or 4.3 lands. | **BLOCKED** by 4.1/4.3 |
| 4.5 | Index the fork's delegation address so `indexesThisDeployment()` is true where trades happen. | **BLOCKED** by 4.1, and awkward regardless: the fork's delegation address changes on every rebuild |

---

## Phase 5 — Remaining blocked items

Each names the specific external thing it waits on. None is a coding gap.

| # | Item | Blocked on |
|---|---|---|
| 5.1 | Live equity fill test, equity sell path, tier 7 settlement on `NVDAc` | The tokens are not functional on a fork. Tier 7's logic is covered by 21 unit tests and its entry reaches the venue with a real route and price; only settlement is impossible here |
| 5.2 | Privy policy attached to the user's embedded wallet | Privy requires the wallet's **owner** to authorise, and for an embedded wallet that is the user, not the app. `/safety` states this |
| 5.3 | LLM agent voice | `OPENROUTER_API_KEY` exists nowhere in the repo. `/bot/say` reports `{"source":"fallback","reason":"no_key"}` rather than pretending |
| 5.4 | Audit chain unbroken on Base Sepolia | Permanent by design — append-only by trigger, so it cannot be rewritten to look clean. The fork's chain is unbroken across 154 entries, which is the evidence the fix works |
| 5.5 | iOS | This machine has Command Line Tools, not Xcode (`xcrun simctl` exits 72). Installing it needs the user's password. Unverified and not claimed |
| 5.6 | A second chain deployment / other hackathons | Deferred by standing direction — ETH Online first. `XorrDelegation` is chain-agnostic and the venue adapter is one file, which is what makes it cheap later |

---

## 3. The gap list

Every gap, tied to the task it blocks, ordered by cost.

| Gap | Where | Blocks | Severity |
|---|---|---|---|
| **The app offers a Buy button for eight assets it cannot fill.** `/market/tradable` lists every equity on a fork; `isTradable('NVDAc')` is true; `/order/NVDAc` renders an enabled ticket; the fill reverts `TF` | `routes/market.ts`, `data/tradable.ts` | 1.1–1.6 | **Critical** — the one place left where the screen is not true |
| **`POST /strategies` accepts an equity on a fork** and fails at run time instead of refusing at creation | `routes/strategies.ts` | 1.4 | **High** — a scheduled strategy that can never fire |
| **No demo recording** | — | 3.1–3.4 | **High** — three met tracks cannot be judged without one |
| **Only one subgraph is ever queried** — slug never created | Studio; `graph/aqua.ts` | 4.1–4.5 | **High** — the only unmet track |
| **Equity mainnet evidence is not in the repo** — the finding lives in a session transcript | — | 2.1–2.3 | Medium — the next reader will conclude the feature is fictional |
| **`indexesThisDeployment()` is false where trades happen** | `graph/client.ts` | 4.5 | Medium — `/history` is permanently empty on the fork |
| **`run.ts` is 1,025 lines** — grew past its pre-split size as venues were added | `executor/run.ts` | — | Low — three splits already landed; this is the residue |
| Privy policy on the user's wallet | platform | 5.2 | **Blocked** |
| No LLM credential | env | 5.3 | **Blocked** |
| Sepolia audit chain forked at entry 2 | history | 5.4 | **Blocked**, permanent by design |
| iOS unverified | no Xcode | 5.5 | **Blocked** |

**Mock/stub/TODO sweep: clean.** One hit across all of `src/`, `app/` and `server/src/` —
`src/test/react-native-stub.ts`, a Node shim used only by unit tests. No mocked data, no stubbed
logic, no TODOs in shipped code.

---

## 4. Suggested order

1. **1.1 → 1.6.** The app should not offer what it cannot do. Half a day, no external dependency,
   and it closes the last untrue thing on screen.
2. **3.1 → 3.4.** The demo. Three tracks are already met and none of them can be judged without it.
3. **2.1 → 2.3.** Cheap, read-only, and it turns "equities are broken" into "equities are live on
   Base and not reproducible on a fork", which is both true and much better.
4. **4.1**, the moment someone can open a browser with the deployer wallet. Everything downstream of
   it is already written.
