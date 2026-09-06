# Sponsor audit — 1inch, The Graph, Privy

Audited 2026-09-07 against the **ETHOnline 2026** prize criteria, by running the flows rather than
grepping for package names. Every claim below has evidence next to it.

---

## The criteria, in the sponsors' own words

| Track | Prize | What it actually requires |
|---|---|---|
| **1inch — Build an Aqua App** | $5,000 | "Official **Aqua/SwapVM contracts must be used**", "onchain execution of token transfers", proper git history |
| 1inch — Aqua App, Continuity | $2,000 | Same, for pre-existing projects |
| **The Graph — Composable or Standardized** | $5,000 | "Compose **two or more** of The Graph's products, or build meaningfully on a standardized schema", live data. **"Simply querying one Subgraph with no composition or standardization does not qualify."** |
| **The Graph — AI Tooling / AI Use Case** | $5,000 ×2 | "Use The Graph as a **load-bearing** part", live data, "meaningful work with the data: reasoning, decisions, automation, or a natural-language interface" |
| **Privy — Best B2B Financial Product** | $2,500 | Privy as a core part, ≥1 Privy wallet, business workflow (payments/approvals/treasury), **"at least one Privy control, such as policies, signers, key quorums, or intents"** |
| **Privy — Best Financial Flow** | $2,500 | Privy as a core part, ≥1 **completed** financial flow (transfer, bridge, stablecoin conversion, swap, Earn vault, onramp) |

Base is not a track on this event — "Base Build Camp" in the README is a separate programme.

---

## 1. Privy — **strongest of the three. One criterion missed.**

### GENUINELY USED

| Capability | Where | Evidence |
|---|---|---|
| Email OTP auth | [src/auth/useAuth.web.ts](src/auth/useAuth.web.ts) — `useLoginWithEmail` | Logged in through the real form this session; a real session with a refresh token landed in `localStorage` |
| Embedded wallet creation | `useCreateWallet` / `useEmbeddedEthereumWallet` | Wallet `0x95A0b368…` exists on the Privy account and is the `owner` in the on-chain policy |
| The wallet **signs the grant** | [src/auth/useGrantDelegation.web.ts:60](src/auth/useGrantDelegation.web.ts:60) — `wallet.getEthereumProvider()` → `eth_sendTransaction` | The approvals and `grant()` that every trade depends on |
| Token verification on **every** request | [server/src/auth/privy.ts](server/src/auth/privy.ts) — `privy.verifyAuthToken` | Every user route; a bad token is 401 |
| Identity → wallet ownership | `privy.getUser` | `wallets.user_id` is the Privy DID; every query is scoped by it |

**A completed financial flow — the Best Financial Flow criterion — is satisfied several times over.**
A swap (`0x17cdec10…`), an Aave Earn deposit (tier 4, aToken to the user), and now a **user-signed
USDC transfer** to an allowlisted address ([src/wallet/useWithdraw.ts](src/wallet/useWithdraw.ts)).

### MISSING — and it is an explicit criterion

**No Privy *control* is used.** The B2B track names them: *policies, signers, key quorums, intents*.
This project uses none. It built its **own** equivalents instead:

- its own policy engine on-chain (`XorrDelegation`: cap, expiry, venue allowlist)
- its own delegated signer (a raw private key in `DELEGATE_PRIVATE_KEY`)
- its own scoped credentials (`agent_keys`, sha256, four scopes)

That is a defensible engineering choice — the enforcement is in a contract the user can read — but
against this track it reads as "did not use the product". **Privy session signers are the exact
primitive this bot needs**: a backend that signs on the user's behalf inside a TEE, *without ever
holding the key*, gated by Privy policies. Today the delegate key sits in a Railway env var.

Also unused: server wallets, key quorums, fiat onramp, Privy Earn, wallet webhooks, smart
wallets/AA, MFA, key export.

### Verdict
**Deep and organic on auth + wallet. Zero on controls.** Adding session signers would both close the
criterion and *remove a real weakness* — the one hot key this system has.

---

## 2. The Graph — **real, live, and load-bearing on the wrong deployment**

### GENUINELY USED

A browser request to `api.studio.thegraph.com/query/1758741/xorr/v0.0.2` fires when `/history`
opens — confirmed live this session, 1 request, real response. The subgraph is deployed, synced, and
indexing our own contract's events; a raw query returns real policies and spends.

| Read | Where |
|---|---|
| `spends`, `dailySpends` — the history screen | [src/data/subgraph.ts:68](src/data/subgraph.ts:68), [app/history.tsx:37](app/history.tsx:37) |
| `policyFor`, `dailySpendFor`, `spendsFor` **before a spend** | [server/src/graph/decide.ts](server/src/graph/decide.ts) |
| `_meta` health | `/verify` — "synced to block 46473881, no indexing errors" |

`decide()` is genuine automation on indexed data — flow-imbalance detection, a stand-down rule, a
size derived from observed remaining cap. That is "reasoning, decisions, automation."

### FAKED — nothing. But two structural problems:

**(a) The second subgraph has no endpoint, so only ONE is ever queried.**
`subgraph-aqua/` builds and pins to IPFS (`QmctadHC…`), and `decide()` imports it — but
`AQUA_SUBGRAPH_URL` is unset on every deployment, so `aquaIndexConfigured()` is `false` and the
Aqua branch never runs. **The composability track disqualifies "simply querying one Subgraph".**
Cause: the `xorr-aqua` slug was never created in Studio; `graph deploy` returns `Subgraph not found`.

**(b) On the deployment where trades actually happen, The Graph contributes nothing.**
`indexesThisDeployment()` compares the running `DELEGATION_ADDRESS` to the indexed one:

```
fork executor delegation : 0x9a927f780e52e57ed5b18e1e2e4843a91b322952   ← where every fill happens
indexed by the subgraph  : 0xb14CF3D0b5269aCDE52322218adb6d5C1daE0a4e   ← Base Sepolia
```

So `decide()` returns `index_is_for_another_deployment` and skips every Graph read. On Sepolia the
subgraph *is* consulted — but 1inch cannot settle there, so no trade ever reaches it. **The history
screen correctly says "Nothing has settled on chain yet", forever.** The two halves never meet.

### MISSING
Substreams, Firehose, the **Token API** (balances, transfers, holders, OHLC — the project uses
CoinGecko for all of it), Graph MCP servers, agent SKILLs. Composing any second product would clear
the composability bar on its own.

### Verdict
**Genuinely used, genuinely live, and genuinely load-bearing — on a deployment that cannot trade.**
Two fixes, neither large: create the Studio slug, and index the fork's contract (or settle where the
subgraph indexes).

---

## 3. 1inch — **the track is Aqua/SwapVM, and the app never calls either**

### GENUINELY USED — but not what this track rewards

| Capability | Where | Evidence |
|---|---|---|
| **Aggregation API v6** — quote | [server/src/venues/oneinch.ts](server/src/venues/oneinch.ts) `api.1inch.dev/swap/v6.0` | `/verify`: "100 USDC → 0.040034 WETH via Tesseraswap, Uniswap V4, Uniswap V3" |
| **Aggregation API v6** — swap calldata, executed on chain | same | Real fills: `0x17cdec10…`, `0xb1f52d50…`, and the exit `0x8d2d6519…` |
| **Spot Price API v1.1** | [server/src/market/crosscheck.ts](server/src/market/crosscheck.ts) | Second opinion against CoinGecko; the asset screen speaks up only on disagreement |

That is **2 of ~15** portal APIs. Fusion, Fusion+, Limit Order, Portfolio, Balance, Token, History,
Traces, Charts, Gas Price, Orderbook, Web3 RPC, Domains: all untouched.

### IMPORTED BUT UNUSED — the finding that matters

`XorrAquaBook` and `XorrSwapVMBook` are **written, deployed and tested** — 15 and 10 fork tests
against the official contracts, with real ERC-20 movement. That is real work. But:

> **The running application never calls either contract.**

`decide()` computes a route and can return `{ venue: 'aqua', strategyHash, maker }`. `runStrategy`
then reads `graphCall.act`, `.reason` and `.rationale` — and **never reads `.route`**:

```
server/src/executor/run.ts:353   const graphCall = await decide({ … })
server/src/executor/run.ts:366   if (graphCall && !graphCall.act && …)      ← .act
server/src/executor/run.ts:367   return finishBlocked(…, graphCall.rationale) ← .rationale
                                  // .route is computed and discarded
```

Every settlement goes through `buildSwap` — the Aggregation Router. The venue decision, which is the
stated point of the two-subgraph join, changes nothing.

`AQUA_BOOK_ADDRESS` is set on the fork deployment and used for exactly one thing: telling `decide()`
which app's books to look for in a subgraph that has no endpoint.

### Verdict — **CLOSED 2026-09-07**

It was true when written: the contracts moved real tokens under `forge test` and the product never
called them. It is not true now.

[server/src/venues/aqua.ts](server/src/venues/aqua.ts) discovers open books from Aqua's **own**
`Shipped`/`Docked` logs — which carry the strategy preimage — quotes each against
`quoteExactIn`, and builds the fill with `delegatedFillArgs`. `runStrategy` tries it before the
aggregator on every non-close leg, and falls through when no book can serve the size, which is a
maker quoting what they hold rather than a failure. The book is on the venue list the user signs,
so `spend()` enforces it like any other venue.

Proved on chain by [server/src/live-aqua.ts](server/src/live-aqua.ts) — **12 checks, 0 failures**:

```
PASS  a book is open on the official Aqua deployment
PASS  the fill executed against the AQUA BOOK, not the aggregation router
        book logs: true · router logs: false · tx 0x3bb021d6823794dc…
PASS  the book emitted its own Swapped event
PASS  the bought token went to the TAKER, not to any contract
PASS  real ERC-20 left the FILLING maker's own wallet — Aqua's whole claim
        maker 0x20E05865… paid 0.058101023129685135 WETH for 150 USDC
PASS  the book contract kept nothing
```

A separate maker wallet ships through the official Aqua contract; the deployed agent takes against
it with the taker's delegated capital. Two self-custodial parties, neither holding the other's
money — which is what Aqua is for.

**Three things this took, none of them obvious:**

- The event ABI was a guess and it was wrong twice over: Aqua's `Shipped` takes `maker, app` in that
  order and **nothing is indexed**. A wrong ABI does not throw — `getLogs` filters on a topic
  nothing emits and returns `[]`, indistinguishable from "no books". The signatures now come from
  the vendored interface.
- The first log window was 200,000 blocks; public Base RPCs cap `eth_getLogs` at **10,000** and
  reject the rest. The caller's `.catch` turned that into a silent aggregator fallback — the exact
  failure mode this codebase refuses everywhere else, in the code written to fix it. Bounded now,
  and a discovery failure is logged rather than swallowed.
- A book is constant-product, so the ratio of shipped inventory **is** the price it quotes. Two WETH
  against ten thousand USDC implied \$5,000 while the reference said \$2,495, and the oracle band
  refused every quote with `PriceOutsideBand`. That is the band doing its job.

---

## Summary

| Sponsor | Status | The one thing to fix |
|---|---|---|
| **Privy** | Deep, organic, real — auth, wallet, signing, verification | Use a Privy **control** (session signers), which also removes the hot delegate key |
| **The Graph** | Real, live, load-bearing — on a chain that cannot trade | Deploy the second subgraph; index the chain that settles |
| **1inch** | Aggregation excellent; **Aqua now settles real fills** ✅ | SwapVM is still contract-tests only |

---

# 50 features, ranked by how load-bearing the sponsor tech is

Ranked hardest-to-fake first: #1–12 are impossible without the sponsor's tech, #40–50 would work with
any substitute.

## Tier 1 — could not exist without it (1–12)

| # | Feature | Capability | Why a judge notices |
|---|---|---|---|
| ~~1~~ | ~~**Route the executor through Aqua.**~~ **BUILT** — `venues/aqua.ts` + the branch in `runStrategy`, proved by `live-aqua.ts` (12/12). | Aqua `ship`/`dock`, on-chain fills | Done |
| 2 | **User-as-market-maker.** The user's idle USDC + shares quote a book from their own wallet, tokens never leaving it, inside the same delegation cap. | Aqua virtual balances | Aqua's own thesis and this product's thesis are the same idea on opposite sides of the book |
| 3 | **Stop-loss compiled to SwapVM bytecode.** Deadline, slippage floor and fee become VM instructions, signed off-chain, executed when the level trips. | SwapVM programs | The exit's *rules* enforced in the VM instead of trusted to our server — a real custody reduction |
| 4 | **Privy session signer replaces the delegate key.** The bot signs inside Privy's TEE under a Privy policy; no private key anywhere in our infrastructure. | Session signers + policy engine | Removes the one hot key; satisfies the B2B "control" criterion outright |
| 5 | **On-chain policy mirrored as a Privy policy.** Cap, venue allowlist and expiry expressed as Privy policy rules, so the signer refuses before the contract has to. | Policy engine | Defence in depth a judge can trigger: revoke in Privy, watch the bot stop |
| 6 | **Key quorum for large trades.** Above a user-set notional, the signature needs a second approver. | Key quorums | "Approvals" is named in the B2B criteria; nothing else gives you m-of-n on an embedded wallet |
| 7 | **Grid strategy as a SwapVM program.** Each rung is an instruction, the whole ladder one signed program, executed rung by rung. | SwapVM instruction library | A strategy that lives as bytecode, not as our cron |
| 8 | **Aqua book depth drives position sizing.** Size the trade to what the book can actually fill rather than to a fixed dollar figure. | Aqua subgraph + Aqua fills | The two-subgraph join finally changes an outcome |
| 9 | **Compose the Aqua subgraph with Substreams.** Substreams for the high-volume flow data, the subgraph for book state, joined at decision time. | Substreams + Subgraphs | Two Graph products composed — the composability track, exactly |
| 10 | **Natural-language portfolio queries over the subgraph.** "What did the bot do while I was asleep?" answered by generating a GraphQL query and reading the index. | Graph MCP / agent SKILLs | The AI track wants a natural-language interface over live Graph data |
| 11 | **Treasury mode.** An org funds one Privy server wallet; members get scoped session signers; spend policies per member. | Server wallets + authorization keys | Straight down the middle of "B2B financial product" |
| 12 | **Cross-chain exit via Fusion+.** Panic-flatten to USDC on the user's chain of choice, intent-based, no bridge UI. | Fusion+ | A completed cross-chain financial flow, and nothing else does it in one intent |

## Tier 2 — the sponsor's tech is the engine (13–26)

| # | Feature | Capability | Why it lands |
|---|---|---|---|
| 13 | Maker-side yield: the book earns spread on the user's shares, reported as APY next to Aave's | Aqua | Makes Aqua a *product* surface, not plumbing |
| 14 | Aqua book health alerts — one-sided flow, depth collapse, book docked | Aqua subgraph | The stand-down rule already exists; this surfaces it |
| 15 | Dutch-auction entries via Fusion for non-urgent DCA | Fusion | Better fills on the one strategy that is never in a hurry |
| 16 | Limit orders as a ladder tier ("buy if it comes to me") | Limit Order Protocol | A tier the ladder is missing, and it is 1inch-native |
| 17 | Portfolio screen from the Portfolio API instead of our own P&L maths | Portfolio API | Removes hand-rolled accounting; adds cost basis and P&L we do not compute |
| 18 | Balance API replaces per-token `balanceOf` multicalls | Balance API | Fewer RPC round trips, one call per wallet |
| 19 | Real transaction history from the History API alongside the subgraph | History API | Two independent accounts of the same events, reconciled |
| 20 | Traces API to explain *why* a revert happened, in the failure message | Traces API | `humanFailure` currently maps selectors; traces give the actual frame |
| 21 | Charts API for the candlestick series, replacing CoinGecko | Charts API | One vendor for price and route — what you pay is what routes |
| 22 | Gas Price API feeding the "bot can afford this" pre-flight | Gas Price API | Already a gate; this makes it accurate per-chain |
| 23 | Token API metadata for the asset screens (logos, decimals, tags) | Token/Token Details API | Kills the last fixtures in `markets.ts` |
| 24 | Privy fiat onramp on the Fund screen | Onramp | "Onramps" is an eligible Financial Flow; the screen exists and is empty |
| 25 | Privy Earn as a ladder tier alongside Aave | Earn | "Self-service Earn vaults" is named in the criteria |
| 26 | Wallet webhooks drive the activity feed instead of polling | Privy webhooks | Real-time, and removes a poll loop |

## Tier 3 — genuine, but a substitute exists (27–38)

| # | Feature | Capability |
|---|---|---|
| 27 | Graph Token API for holder counts and concentration warnings before a buy | Token API |
| 28 | Substreams-powered "whale moved" alerts on held tokens | Substreams |
| 29 | A standardized-schema subgraph so other agents can read our delegation events | Standardized schema |
| 30 | Graph MCP server exposing this bot's book to other agents | MCP |
| 31 | Agent SKILL: "explain this strategy's history" over the subgraph | SKILLs |
| 32 | x402-metered access to our own strategy index | x402 |
| 33 | Privy smart wallet (AA) so the user pays gas in USDC | Smart wallets |
| 34 | Privy MFA on cap increases and allowlist additions | MFA |
| 35 | Privy key export for the "get out entirely" flow | Key export |
| 36 | Multi-org support: one Privy org per fund, wallets per strategy | User management |
| 37 | 1inch Domains API to resolve destinations on the Send screen | Domains API |
| 38 | Orderbook API to show resting depth on the order ticket | Orderbook API |

## Tier 4 — the sponsor is swappable (39–50)

| # | Feature | Capability |
|---|---|---|
| 39 | Web3 RPC as the chain transport instead of the public Base RPC | 1inch Web3 RPC |
| 40 | Transaction Gateway for broadcast with better inclusion | Transaction Gateway |
| 41 | Subgraph-backed leaderboard across all users | Subgraph |
| 42 | Graph-indexed audit-chain verification page | Subgraph |
| 43 | Privy social login alongside email | Auth |
| 44 | Privy passkeys for the kill switch | Passkeys |
| 45 | 1inch NFT API for a "position receipt" collectible | NFT API |
| 46 | Spot Price API on every screen, not just the crosscheck | Spot Price |
| 47 | Graph Explorer link-outs from every settlement row | Explorer |
| 48 | Privy session tokens for a CLI companion | Session tokens |
| 49 | Firehose export for a research notebook | Firehose |
| 50 | Multi-chain expansion using 1inch's 13-chain coverage | Aggregation multi-chain |

---

## If only three things get built

1. **#1 — route through Aqua.** One `if` in `runStrategy`, and the 1inch track goes from
   "impressive, wrong protocol" to satisfied. The contracts and tests already exist.
2. **#4 — Privy session signers.** Closes the only Privy criterion missed, and deletes the hot key.
3. **#9 or the Studio slug.** Either composes a second Graph product or gets the second subgraph
   live — both clear the "one subgraph does not qualify" bar.
