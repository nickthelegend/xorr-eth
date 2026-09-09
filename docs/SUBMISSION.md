# Submission — ETHOnline 2026

**Live app:** [`web-production-3e214.up.railway.app`](https://web-production-3e214.up.railway.app)
— open it and sign in; a new wallet is sent testnet gas automatically so the permission is signable.

**Demo:** [`docs/demo/demo.mp4`](demo/demo.mp4) — 96 seconds against that same deployed app, not a
local dev server. Sign in with Privy, the on-chain permission, live markets, a recurring buy, the
activity trail, `/judge` re-running twenty claims live, and the kill switch.
Script in [`DEMO-SCRIPT.md`](DEMO-SCRIPT.md); regenerate with `node tools/demo.mjs`.


One page per track, each pointing at evidence a judge can check without taking anything on trust.
Every hash and address below is real and live at the time of writing.

**Repo:** https://github.com/nickthelegend/xorr-eth
**Live verification console:** `/judge` in the app, or `GET /verify` with no account:

```bash
curl -s "https://executor-fork-production.up.railway.app/verify" | jq '.passed, .failed'
```

---

## The project in one paragraph

Handing a bot your money is a trust problem, not a trading problem. So the permission is the
product: `XorrDelegation` is a contract **you** grant, that caps what the bot may spend per day,
restricts it to venues you allowlisted, expires on its own, and cannot move funds to an address of
the bot's choosing. Revoking takes one signature from you and nothing from us. Everything the bot
then does is readable back off the chain, so the history you check is not a history we hold.

Seven strategy tiers, in a fixed order of how much judgement each needs — a recurring buy first, an
event-driven earnings strategy last. Every tier settles on chain through 1inch.

---

## 1inch — Build an Aqua App

**The bar:** official Aqua/SwapVM contracts must be used, with on-chain execution of token
transfers.

**Aqua settles real trades. SwapVM is built, tested and wired into the settlement path, and has
not settled one** — `/metrics` reports `fillsByVenue` with no `swapvm` key at all. Said here
because the audit trail this submission invites you to check would say it anyway.

`XorrAquaBook` is a real Aqua app. The proof script `server/src/live-aqua.ts` runs twelve checks
end to end and passes all twelve, including the two that actually matter:

| Check | Observed |
|---|---|
| The fill executed against the **Aqua book**, not the aggregation router | book logs `true` · router logs `false` |
| The token came **out of the maker's own wallet** — Aqua's whole claim | maker paid 0.0581 WETH for 150 USDC |
| The book contract kept nothing | zero WETH, zero USDC |

Fill: `0x0ec519a726035f70ce88f0ebf72efc89b36ac6f12ee35a117e198d70e3a3064b` — 0.0581 WETH at
$2,497.93, taker receives, book keeps nothing.

`XorrSwapVMBook` compiles the terms of a trade — deadline, slippage floor, fee, salt — into SwapVM
program bytecode, so the **rules of the fill are enforced inside the VM** rather than trusted to
whoever submits it. Ten fork tests, including behavioural guards proving the deadline really
expires and the fee really costs. `server/src/venues/swapvm.ts` wires it into the executor's
settlement path: programs are discovered from Aqua's own `Shipped`/`Docked` logs filtered to the
SwapVM router, and `delegatedFillArgs` computes the call so the encoding is never reimplemented
off-chain.

Venue selection is ordered Aqua → SwapVM → aggregator, and never on a close, because an exit has to
be certain and a book deep enough to buy into may not be deep enough to sell out of.

`/metrics` counts where trades actually settled: **`{1inch: 33, aqua: 5}`** — live, and checkable
with `curl -s .../metrics | jq .fillsByVenue`. Two caveats a judge should have rather than
discover: the counter is cumulative in Postgres, and the five Aqua fills were made against an
earlier anvil instance, so their hashes do not resolve on the fork running today. And nothing
ships a maker book at boot — `fork-bootstrap.ts` deploys `XorrAquaBook` and never calls `ship`,
which `server/src/live-aqua.ts` does by hand — so until that is run after a rebuild, the Aqua
branch finds no book and falls through to the aggregator.

**Also used:** Aggregation API v6 for quotes and swap calldata, and the Spot Price API as an
independent second opinion — `/market/crosscheck` reports both prices, their spread, and whether
there was anything to compare against at all.

---

## Privy — Best B2B Financial Product

**The bar:** Privy as a core part, at least one wallet, a business workflow, and **at least one
Privy control** — policies, signers, key quorums or intents.

**A policy owned by a key quorum, and its refusal proven live.**

`/verify` runs two checks a judge can trigger themselves:

| Check | Observed |
|---|---|
| `privy-policy` | 13 rules over 13 destinations, owned by key quorum `zixx49ik3ngslu9oay54q4li` |
| `privy-refusal` | refused: `"RPC request denied due to policy violation"` |

The second is the one worth looking at. It does not assert that a policy exists — it attempts a
transaction the policy forbids and reports Privy's own refusal. A policy nobody has tried to break
is a claim; a refusal is evidence.

**Also core:** email OTP auth, embedded wallet creation, `verifyAuthToken` on every request, and
`wallets.user_id` keyed to the Privy DID so every query is scoped to the authenticated user.

**Stated honestly:** the policy is not attached to the user's own embedded wallet. Privy requires
the wallet's owner to authorise that, and for an embedded wallet the owner is the user, not the
app. `/safety` says so on screen rather than implying otherwise.

---

## Privy — Best Financial Flow

**The bar:** at least one completed financial flow.

Three, each completed on chain:

1. **A swap** — `0x17cdec10…`, USDC into WETH through the delegation.
2. **An Earn deposit** — 100 USDC supplied to Aave v3, aToken to the user:
   `0x8c78a44240d1ca6b3cb1f85ac278c8de3d4deb187aab88baa5b835b7c57f09f8`.
3. **A user-signed withdrawal** — USDC to an allowlisted address, signed by the Privy embedded
   wallet, with a 24-hour cooling-off on any newly added destination.

The kill switch is the flow worth demonstrating: tapping "Stop all agents" sends a real `revoke()`
that the user signs, and the chain reads `revoked: true` within a block. Nothing on our side
participates.

---

## The Graph — where this stands

**Not claimed.** The track requires composing two or more Graph products, and this project queries
one.

What is real: a deployed, synced subgraph indexing our own contract, queried from both the client
and the executor, and load-bearing — `decide()` reads the indexed policy and daily spend before
every trade, so `/graph/decision` returns `observedRemainingUsd` from the index rather than from our
database, and refuses to act on a revoked policy seconds after the revoke lands. `/verify` reports
"synced to block …, no indexing errors".

What is missing: `subgraph-aqua/` is written, built and IPFS-pinned as
`QmctadHCDBprb9Q1Pq4oyMXjB6KcnUDHRheDRNyBA59tAJ`, and has no endpoint — the Studio slug was never
created, and `graph deploy` answers `Subgraph not found`. So one subgraph is ever queried, which the
criteria disqualify by name. Said here rather than dressed up.

---

## What a judge should do first

1. **`/judge` in the app**, or `curl .../verify`. Eighteen claims, each with the observed value and
   the call that produced it. It reports its own failures — the Base Sepolia audit chain forks at
   entry 2 from a race that has since been fixed, and it says so, because a trail that can be
   rewritten to look clean proves nothing.
2. **`/safety`** — the two parties named, the Privy policy, the approvals, and a kill switch that
   is one real signature.
3. **`/activity`** — every action an agent took *and every one it chose not to take*, each row
   hash-chained to its predecessor and append-only by database trigger.

## Known and stated

- Tokenized equities price correctly and cannot be filled on a fork: the tokens carry one byte of
  code and answer calls on real Base, while an anvil fork of the same block reverts. `/verify`
  skips them with that reason rather than passing on a code-length check, which is what it used to
  do.
- No LLM credential, so the agent voice returns `{"source":"fallback","reason":"no_key"}` rather
  than pretending.
- iOS is unverified — this machine has Command Line Tools, not Xcode. Android is verified on a real
  emulator.
