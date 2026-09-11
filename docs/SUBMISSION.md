# Submission — ETHOnline 2026

**Live app:** [`xorr-eth.vercel.app`](https://xorr-eth.vercel.app)
— open it and sign in. A new wallet is sent testnet gas automatically so the permission is signable,
and the demo wallet's own permission is live until **2026-10-11**. The frontend is on Vercel; the
executors, the fork and Postgres are on Railway.

**Demo:** [`docs/demo/demo.mp4`](demo/demo.mp4) — 91 seconds against the hosted app and its public
executor, not a local dev server. Script in [`DEMO-SCRIPT.md`](DEMO-SCRIPT.md); regenerate with
`node tools/demo.mjs`.

**Repo:** https://github.com/nickthelegend/xorr-eth

Every hash, address and number on this page was re-checked against the live deployments on
**2026-09-11**. Anything that could not be checked is marked as such rather than left in.

---

## The project in one paragraph

Handing a bot your money is a trust problem, not a trading problem. So the permission is the
product: `XorrDelegation` is a contract **you** grant, that caps what the bot may spend per day,
restricts it to venues you allowlisted, expires on its own, and cannot move funds to an address of
the bot's choosing. Revoking takes one signature from you and nothing from us. Everything the bot
then does is written to a hash-chained trail **whose head is published to Base**, so the history you
check is not a history you have to take from us.

Seven strategy tiers, ordered by how much judgement each needs — a recurring buy first, an
earnings strategy last — and every one settles through the same permission, on 1inch.

---

## Check these first — three minutes, no account needed for the first

**1. `/judge` in the app, or the same checks over HTTP:**

```bash
curl -s "https://executor-production-1659.up.railway.app/verify?owner=0x95A0b368588713011a15f4b1041423f31B08e615" \
  | jq '{passed, failed, skipped}'
```

21 claims, each re-run live with the call it made and what came back: **19 pass, 1 fail, 1 skip**.
The failure is real and deliberately left visible — see [Known and stated](#known-and-stated).

**2. `/audit/anchor`** — the audit trail's head hash, held by a Base contract, with the contract and
the signing key on screen so the read can be repeated without us.

**3. `/route/WETH`** — the same trade priced at every venue, including the ones that refuse, with the
gas each one costs and what is left after paying it.

**4. `/safety`** — LIVE, the two parties named, and a kill switch that is one real signature.

---

## 1inch — Build an Aqua App

**The bar:** official Aqua/SwapVM contracts must be used, with on-chain execution of token
transfers.

**Both settle real trades, and every one of them goes through the user's own permission.** Counted
by the executor that made them, on the Base mainnet fork:

```bash
curl -s https://executor-fork-production.up.railway.app/metrics | jq .fillsByVenue
{ "swapvm": 4, "1inch": 36, "aqua": 7 }
```

The fork was rebuilt on 2026-09-11 — its chain state has no disk, and the service restarted. The
counts live in Postgres and survived; the receipts from before did not. **Every fork hash on this
page is from the rebuilt fork**, re-run and re-read the same day.

### Aqua

`XorrAquaBook` is an Aqua app on the official deployment. A maker keeps their tokens in their own
wallet and quotes anyway; the deployed executor discovers the book from Aqua's own logs and fills
it through `XorrDelegation.spend()`, so the taker's cap, expiry and venue allowlist are all enforced
by the contract they signed.

`server/src/live-aqua.ts` proves it end to end against the deployed executor — **12 checks, 12
passed**, most recently on 2026-09-11:

| Check | Observed |
|---|---|
| The fill executed against the **Aqua book**, not the aggregation router | book logs `true` · router logs `false` |
| The token came **straight out of the maker's own wallet** — Aqua's whole claim | maker paid 0.056536047164408186 WETH for 150 USDC |
| The bought token went to the taker, not to a contract | taker `0x95A0b368…` |
| The book contract kept nothing | zero WETH, zero USDC |

Fill: `0xe4875211da8068037dd9e9987dda572bc6e6abeb32870e2a23ead90c971824a9` — status success, `to` is
`XorrDelegation`. (The fork is a private node, so there is no explorer; `eth_getTransactionReceipt`
against `base-fork-production.up.railway.app` returns it.)

### SwapVM

`XorrSwapVMBook` compiles the terms of a trade — deadline, slippage floor, fee, salt — into SwapVM
program bytecode, so **the rules of the fill are enforced inside the VM** rather than trusted to
whoever submits it. A maker ships the program to official Aqua under the SwapVM router
(`0x111111338c5091E8440b67B168bAe16a668AC0De`); the executor discovers it and fills it through the
delegation.

| | |
|---|---|
| The executor's own strategy run, routed to SwapVM | `0x72ef86131e9088a4b0c5ba473bb291f984217e2438aef98b9ec28d4854f7ceb0` |
| The maker-and-taker proof, `live-swapvm.ts` — 18 checks, 18 passed | `0x12a02f40f41237918c587dd78192f3b3c9eb45787f081c6ccaba69a224aa1409` |
| An impossible floor, refused **by the VM itself** | router error `0xf44f8993` at call depth 2 — inside the router, not a guard of ours |

This was not true at the start of the week. `SPONSOR-AUDIT.md` recorded *"zero trades, on any
deployment, ever"*, and the reason was not the contract: discovery scans Aqua's logs, the provider
had tightened `eth_getLogs` to 2,000 blocks against a 9,000-block scan, and the failure was being
caught into "no program found". The scan pages now, which is what made the programs visible.

### Every venue, priced for the same trade

Settling somewhere is a label. `GET /route/compare` asks all three venues the same question and
reports every answer — including the refusals, because "no book is deep enough at this size" is
information — plus what each transaction costs to send, estimated from the chain rather than taken
from a table. On the fork, 100 USDC into WETH:

| Venue | Out | Gas | Net |
|---|---|---|---|
| 1inch Aggregation (via Uniswap V3) | 0.038840 WETH | $1.0228 | **$98.58** |
| 1inch SwapVM | 0.038724 WETH | $0.8379 | $98.47 |
| 1inch Aqua | cannot serve — *no maker book is deep enough for this size right now* | | |

Gas is estimated per route rather than assumed per venue, and it changes the picture from one
measurement to the next: on the previous fork SwapVM cost more gas than the aggregator; on this run
the aggregator's Uniswap V3 path cost more, and still came out ahead — 30 bps more WETH, and $0.11
more after gas. When the net winner differs from the gross winner, the screen says so.

### How well each venue actually filled

`/metrics` records, for every fill, how far it landed from the market price at the moment the run
decided to trade — implementation shortfall against the arrival price, the same reference for every
venue. Every measurement so far:

| Venue | Fills | Mean vs arrival price | Range |
|---|---|---|---|
| SwapVM | 2 | **+73.2 bps** | +71.1 to +75.2 |
| Aqua | 2 | **−309.8 bps** | −311.8 to −307.8 |

A supply to Aave is deliberately absent: it converts 1:1, so there is no execution in it to grade.
It was briefly counted as a perfect aggregator fill, which `013-supply-is-not-a-fill.sql` corrected.

These are **not a ranking**, and the screen says so. The fork is pinned at a block while the price is
live, and the Aqua figure carries the pricing of the proof maker that shipped that book. It is
included because a metric that shows a bad fill is the only kind worth believing when it shows a
good one.

**Also used:** Aggregation API v6 for quotes, calldata and gas estimates, and the Spot Price API as an
independent second price source on `/market/crosscheck`.

---

## Privy — Best B2B Financial Product

**The bar:** Privy as a core part, at least one wallet, a business workflow, and **at least one Privy
control** — policies, signers, key quorums or intents.

**A policy owned by a key quorum, and its refusal proven live.** Both are among the 21 checks above:

| Check | Observed |
|---|---|
| `privy-policy` | 4 rules over 4 destinations, owned by key quorum `zixx49ik3ngslu9oay54q4li` |
| `privy-refusal` | refused: `"RPC request denied due to policy violation"` |

The second is the one worth looking at. It does not assert that a policy exists — it attempts a
transaction the policy forbids and reports Privy's own refusal. And because a key quorum owns the
policy, widening it needs the quorum's signature — which this server's app secret cannot produce, so
compromising the server does not widen what the wallet may do.

**Also core:** email OTP auth, embedded wallet creation, `verifyAuthToken` on every request, and every
query scoped to the authenticated Privy DID. Checked with two real accounts on 2026-09-10: the
second sees none of the first's wallet, limits, strategies or trail.

**Stated plainly:** the policy is not attached to a user's own embedded wallet. Privy requires the
wallet's owner to authorise that, and the owner is the user. `/safety` says so on screen.

---

## Privy — Best Financial Flow

**The bar:** at least one completed financial flow.

| Flow | Evidence |
|---|---|
| **Granting the bot permission** — token approvals, then `grant()`, each signed by the user's Privy embedded wallet in Privy's own dialogs | `0xf718121116ef61452ee398fe744cbe9cca3a6607a5460b68a4feade02a335c88` on **Base Sepolia**, from the user's wallet to `XorrDelegation` — [explorer](https://sepolia.basescan.org/tx/0xf718121116ef61452ee398fe744cbe9cca3a6607a5460b68a4feade02a335c88). $1,600/day, 30 days. |
| **A swap through that permission** — USDC into WETH, filled by a maker's Aqua book | `0xe4875211…`, above |
| **An Earn deposit** — 100 USDC supplied to Aave v3 on the Base mainnet fork, aToken straight to the user (its aUSDC went 0 → 99.999999) | `0x7b2a9e9f29f818f104228ce971bd4df6efd403be7ab2344d3fccb9bdea34f542` |
| **Stopping everything** — "Stop all agents" sends a `revoke()` the user signs | The contract half, run end to end on the Base mainnet fork on 2026-09-10 with the owner's key impersonated: the chain read `revoked: true`, `/limits` read `$0`, and `spend()` reverted `PolicyRevoked()`. The signing half is the same Privy dialog as the grant above. |

A withdrawal flow is built too — USDC to an allowlisted address, signed by the embedded wallet, with a
24-hour cooling-off on any newly added destination — but it is not listed as completed, because
there is no transaction from this week to point at.

---

## The Graph — where this stands

**Not claimed.** The track requires composing two or more Graph products, and this project queries
one.

What is real: a deployed, synced subgraph indexing our own contract, queried by both the client and
the executor, and load-bearing — `decide()` reads the indexed policy and daily spend before every
trade, so `/graph/decision` returns what the index says is left today rather than what our database
says, and refuses to act on a revoked policy seconds after the revoke lands.

What is missing: `subgraph-aqua/` is written, built and IPFS-pinned as
`QmctadHCDBprb9Q1Pq4oyMXjB6KcnUDHRheDRNyBA59tAJ`, and has no endpoint — creating the Studio slug is a
wallet-signed dashboard action that no API exposes. So one subgraph is queried, which the criteria
disqualify by name.

---

## The trail you do not have to trust us about

This is not a sponsor track, and it is the part of the project worth the most scrutiny.

Every action the bot takes — and every one it chose not to take — is a row in an append-only table
where each row commits to the hash of the one before it. Editing history breaks the chain. That is a
real property with one honest limit: every part of it lives in our database, and a reader who does
not trust us has no reason to trust our report that our own log is intact.

So the head of the chain is published to Base. `XorrAuditAnchor` at
[`0xB58cB717867988582DcCB7f3155DeD3fC7A76caf`](https://sepolia.basescan.org/address/0xB58cB717867988582DcCB7f3155DeD3fC7A76caf)
holds it, signed by the same key `/safety` names as the bot's. The executor publishes on an hourly
sweep, on its own — for example entry 70 at block 46,684,612, on 2026-09-11 at 14:38 UTC, with
nobody pressing anything. There will be newer ones by the time this is read. Rewriting history is still possible; producing a rewrite that hashes
to a value Base has been holding since before the rewrite is not.

`/verify` reads it back: *"…for 70 entries, held by Base since block 46,684,612"*. And the check is
careful about the one case that matters — a trail with more rows than were anchored is normal, but so
is a rewritten one, so it re-hashes the row **at** the anchored position before calling it healthy.

---

## Known and stated

- **One check fails, on purpose.** The Base Sepolia audit trail forks at entry 2, from a race between
  two writers before the append lock existed. The trail is append-only, so it cannot be repaired
  without destroying the property it exists to prove. `/verify` says *"Exactly one, at entry 2, and
  none since — the lock holds. All rows are individually unaltered."*
- **Fills happen on a Base mainnet fork, not on Sepolia.** 1inch has no deployment on Sepolia. The app
  says so on `/network` and `/metrics` rather than pretending, and the permission, signing and
  indexing are what Sepolia proves.
- **Tokenized equities price correctly and cannot fill on a fork** — the tokens carry one byte of code
  that a fork copies without the thing that serves it. `/verify` skips them with that measurement.
- **No LLM credential exists**, so the agent's voice refuses in words (`source: "none"`) rather than
  printing a canned line.
- **iOS runs** on an iPhone 17 Pro simulator (`docs/ios/`); on that fork build the kill switch is
  correctly disabled, because a Privy signature there would target public Base. Android is verified on
  an emulator with a genuine embedded wallet.
- **The demo video ends on `EXPIRED`** — it was recorded while the demo wallet's permission had lapsed.
  The live app is renewed and reads LIVE.
