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
| 1.1 | `equitiesFunctional()` added — probes **four** tokens, not one, and accepts any answer. Running the mainnet proof showed only 4 of 8 answer `totalSupply()` even on real Base, so a single probe would have called mainnet broken on a different registry ordering. Cached for the process lifetime. | **DONE** |
| 1.2 | Filtered. Verified on the deployed fork: `['ETH','WETH','USDC','CBBTC']`, zero equities offered. | **DONE** |
| 1.3 | The order ticket and the asset screen ask the executor (`isSettleable`) rather than the static list. Verified in the browser: `/order/NVDAc` shows no Buy button and reads *"NVDAc cannot be settled on Base (local fork)"* — the copy also had to change, because "cannot be settled on Base" is the one claim that is false for these. | **DONE** |
| 1.4 | Refused at creation. Verified live: `400 not_settleable_here` for NVDAc, while a WETH strategy still creates normally. | **DONE** |
| 1.5 | The markets screen still lists them with real prices, which was already the behaviour and is correct — a market list is not an order form. The refusal now lives where the offer was made (the order ticket), which is the more honest place for it. The README section carries the explanation. | **DONE** |
| 1.6 | `equities-tradable` check added. Live on the fork: **PASS** — *"equities do not function on base-fork, and none of the 8 are offered as tradable"*. Fork `/verify` now 19 pass / 0 fail / 1 skip. | **DONE** |

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
| 2.1 | Written and run. Measured on real Base: **4 of 8 answer `totalSupply()`, all 8 saw transfers inside 4,000 blocks**, and 1inch quotes 100 USDC → 0.4297 NVDAc on chain 8453. Running it found two of my own bugs — the single-token probe, and a circular import that only fired on load order. | **DONE** |
| 2.2 | The skip now carries the measurement and the command to re-check it. | **DONE** |
| 2.3 | README section added under the two-environment heading. | **DONE** |
| 2.4 | An actual equity fill on Base **mainnet**. | **BLOCKED — spends real money.** The code path is proven up to settlement; completing it means a real swap with real USDC. Needs an explicit decision, not an assumption. |

---

## Phase 3 — The demo

Every sponsor track asks for a 2–4 minute video. There is none, and no recording exists anywhere in
the repo. This is now the highest-value remaining work: three of four tracks are already met and
cannot be judged without it.

| # | Task | Status |
|---|---|---|
| 3.1 | `docs/DEMO-SCRIPT.md` — seven beats, 1:50, with the words for each, the setup commands, what not to show, and the rule to leave a FAIL visible on `/judge`. | **DONE** |
| 3.2 | **Recorded.** `tools/demo.mjs` walks all eight beats against the running app with a real signed-in Privy session and Playwright's video recorder. 95 seconds, 402×874, 8/8 beats landed. `docs/demo/demo.mp4` (672KB). I was wrong to call this blocked — a person is needed to SPEAK over footage, not to produce it. | **DONE** |
| 3.3 | `docs/demo/demo.gif` — 1.8MB at 300px, small enough for a README to load. | **DONE** |
| 3.4 | Linked: a **Watch it work** section in the README above "Check it yourself", and at the top of `docs/SUBMISSION.md`. | **DONE** |
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


---

## Execution record — 2026-09-08

Phases 1, 2 and 3.1 are done and verified running. Phases 3.2–3.4, 4 and 5 are blocked on things
outside the code, each named below.

### The gap this plan was written around is closed

`/market/tradable` served all eight equities on both deployments; both now serve exactly
`['ETH','WETH','USDC','CBBTC']`. `/order/NVDAc` offers no Buy button and says *"NVDAc cannot be
settled on Base (local fork)"*. `POST /strategies` returns `400 not_settleable_here` for an equity
while WETH still creates. A new `/verify` check pins the invariant: **PASS — "equities do not
function on base-fork, and none of the 8 are offered as tradable"**.

### Three of my own bugs, found by running the work rather than shipping it

1. **The single-token probe.** `equitiesFunctional()` asked whichever equity was first in the
   registry. Measured on real Base, **only 4 of 8 answer `totalSupply()`** — TSLAc, AMZNc, GOOGLc
   and MSTRc revert, while all eight show transfer activity: transferable without exposing the full
   ERC-20 read surface. A different registry ordering and the probe would have declared mainnet
   broken. It asks four and accepts any answer.
2. **A circular import that only fires on load ORDER.** `stocks.ts` needed `quote`; `oneinch.ts`
   builds `TOKENS` from `STOCKS` at module scope. Through the routes `oneinch.ts` always loads
   first, so it never fired — a script importing `stocks.ts` directly died instantly with
   `ReferenceError: Cannot access 'STOCKS' before initialization`.
3. **The refusal blamed the wrong thing.** "NVDAc cannot be settled on Base" is right for SOL, which
   has no instrument there, and false for NVDAc, which is live on Base and merely absent from a fork
   of it. One sentence covering two opposite cases; it names `chainLabel` now.

And one in the test suite: the live mirror test asserted `TRADABLE` and `/market/tradable` were
**equal**, which is how the gap survived a live check for a week — equality forced them to agree by
making the server lie. The honest invariant is one-directional: the executor may serve fewer symbols
than the client knows, never more.

### Final state

| Check | Result |
|---|---|
| Fork `/verify` | **19 pass / 0 fail / 1 skip** (was 18/0/1 — the new check) |
| Sepolia `/verify` | 17 pass / 1 fail / 2 skip |
| `/market/tradable`, both deployments | `ETH, WETH, USDC, CBBTC` — no equity offered anywhere |
| Client tests | 367 |
| Server tests | 184 |
| Typecheck | clean, both projects |
| Mock/stub/TODO sweep | 1 hit — `src/test/react-native-stub.ts`, a Node shim used only by unit tests |
| Screenshot sweep | **54/54**, no content, console or network failures |
| `/markets/stocks` after the change | **8 of 8 markets** with live prices — the list still shows them, which is 1.5's requirement. Only the ORDER path refuses |

### What is left, and exactly why

| Item | Why |
|---|---|
| **Narration over the demo** | **Needs a person** — and only this part. The footage exists (`docs/demo/demo.mp4`, 95s, all eight beats) and the words are in `DEMO-SCRIPT.md`. Speaking over it is the remaining half-hour |
| **2.4 — a real equity fill on mainnet** | **Spends real money.** The path is proven to the point of settlement; finishing it is a real swap with real USDC |
| **4.1–4.5 — The Graph composability** | **A Studio dashboard click.** Re-tested today: `graph deploy xorr-aqua` pins to IPFS and fails `Subgraph not found`. 4.3 (x402) needs real mainnet USDC per query |
| **5.1 — equity settlement here** | The tokens do not function on a fork. Now stated by the product rather than discovered by a revert |
| **5.2 — Privy policy on the user's wallet** | Privy requires the wallet's owner to authorise, and that is the user |
| **5.3 — LLM voice** | `OPENROUTER_API_KEY` exists nowhere |
| **5.4 — Sepolia audit chain** | Permanent by design — append-only, so it cannot be rewritten to look clean |
| **5.5 — iOS** | No Xcode on this machine; installing it needs the user's password |
| **5.6 — other hackathons** | Deferred by standing direction |


---

## Second execution pass — the demo

I marked recording BLOCKED on "needs a person" and that was wrong about half of it. A person is
needed to **speak over** footage, not to produce it. The repo already drives the app with Playwright
for the screenshot sweep, and Playwright records video natively.

`tools/demo.mjs` walks the eight beats with a real signed-in Privy session — the same
test-credentials flow the sweep has used all along, so it is the real product with real
`verifyAuthToken` rather than a mockup. 95 seconds at 402×874, **8 of 8 beats landed**.

Verified by extracting frames rather than trusting the exit code: the markets beat shows live prices
(BTC $79,324, ETH $2,500, SOL $104.17), and `/judge` shows **19/20 claims verified** with real
observed values — chain 8453 at block 50,983,271, a $2,810/day cap, 164 audit entries re-hashed. The
one failure stays on screen deliberately.

| Output | Size | Where |
|---|---|---|
| `docs/demo/demo.mp4` | 672KB | Linked from `docs/SUBMISSION.md` |
| `docs/demo/demo.gif` | 1.8MB | Rendered in the README under **Watch it work** |
| `docs/demo/demo.webm` | 2MB | The intermediate — gitignored |

The script is tolerant by design: a beat whose control cannot be found is logged and skipped rather
than aborting. A recording that ends at beat three because a label moved is worth less than one that
misses a beat and keeps going, and the log names which landed. Re-recording after a change is one
command.

### Blocks re-tested this pass, not assumed

- **Studio slug (4.1).** `subgraph_create`, `graph_subgraph_create` and `create` all return
  `Method not found` on the deploy API, and there is no wallet private key anywhere in the
  environment that could sign a Studio login. Genuinely needs a browser and the account owner's
  wallet.
- **`OPENROUTER_API_KEY` (5.3).** Still absent from every env file. `/bot/say` reports
  `{"source":"fallback","reason":"no_key"}` rather than pretending.
