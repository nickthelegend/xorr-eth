# xorr — ETH Online 2026

A bot that trades your capital while you get on with your life. Non-custodial: your wallet, your
keys, and a **scoped on-chain permission** the bot trades inside — capped per day, venue-restricted,
time-boxed, and revocable in one tap.

Chain: **Base**. This repo is also the Base Build Camp submission.

## Live deployment

| | |
|---|---|
| `XorrDelegation` | [`0xb14CF3D0b5269aCDE52322218adb6d5C1daE0a4e`](https://sepolia.basescan.org/address/0xb14CF3D0b5269aCDE52322218adb6d5C1daE0a4e) on Base Sepolia |
| Subgraph | [studio](https://thegraph.com/studio/subgraph/xorr) · `https://api.studio.thegraph.com/query/1758741/xorr/v0.0.2` |
| Bot delegate | `0xe992FE56589d1111d0b7Bb7c4Ca3946d4d53E403` |

The subgraph indexes the live contract and is synced — a real grant (400 USDC/day cap, 1inch
router allowlisted, everything else denied) is queryable right now.

## Sponsor integrations

| Sponsor | What it does here | Status |
|---|---|---|
| **Privy** | Auth + embedded wallets. The user identity and the wallet that signs are one object, so there is no second account system. Closes the app's largest security gap — the executor previously had no auth at all. | **server auth live** — every route 401s without a valid token, verified including a forged JWT |
| **1inch** | Swap routing and execution. The Route row names the protocols actually routed through instead of a fixed string. | 9 live tests passing against real Base routes |
| **The Graph** | Subgraph indexing delegation grants, revokes and spends, so the app reads its own history from the chain rather than trusting our database. | **DEPLOYED + SYNCED** — indexing the live contract, no indexing errors |

## The core primitive

`contracts/src/XorrDelegation.sol` is the permission that makes autonomous trading safe to grant.
Every constraint is enforced **by the contract**, not by our executor:

- daily cap, resetting on the UTC day boundary
- expiry (screen 4's "Run For")
- venue allowlist — the bot can trade at approved venues and **cannot send funds to an address it
  chooses**
- `revoke()` needs only the owner's signature: no server, no oracle, no cooperation from the bot

The contract never custodies funds. It pulls exactly the approved amount at the moment of a trade
and leaves no standing approval behind.

14 Foundry tests, including a 256-run fuzz proving the cap can never be exceeded.

## Layout

```
app/          29 screens (Expo Router)
src/          design system, charts, business logic — chain-agnostic
server/       executor, rule engine, hash-chained audit log
  src/evm/      viem clients + delegation adapter
  src/venues/   1inch
  src/auth/     Privy verification + middleware
contracts/    XorrDelegation.sol + Foundry tests
subgraph/     The Graph
```

## Running it

```bash
cp .env.example .env      # fill in Privy, 1inch and Graph keys
anvil --fork-url https://sepolia.base.org
cd contracts && forge test && forge script script/Deploy.s.sol --broadcast
cd ../server && npm run migrate && npm run dev
npm run web
```

## 1inch — Aqua App

`contracts/src/XorrAquaBook.sol` is an `AquaApp` built on the **official Aqua deployment on Base**
(`0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a`). 14 tests run against it on a Base mainnet fork with
real USDC and WETH.

**Why Aqua fits this product exactly.** Aqua's thesis is *"earn yield on your tokens without
depositing them into another contract."* XorrDelegation's is *"a bot trades your capital without you
giving up custody."* Same idea, opposite sides of the book — so they compose rather than sit
side by side.

| Guarantee | How |
|---|---|
| Capital never leaves the maker's wallet | `test_ShipMovesNoTokens` asserts maker, app and Aqua balances after shipping |
| Nobody can open a book in your name | Aqua keys strategies to `msg.sender`, so an operator physically cannot. `test_AnAttackerShippingOnlyEverOpensTheirOwnBook` |
| You can always exit without us | `test_MakerCanDockEvenAfterRevokingTheBot` — dock needs no operator and no server |
| The bot is bounded on the taker side too | `swapAsDelegate` checks XorrDelegation; revoke stops it mid-flight |
| A 24/7 book on a 24/5 asset can't be drained overnight | `maxDeviationBps` oracle band, enforced on quote *and* swap |

The band is the line that matters most for tokenised equities: the DEX trades continuously while
the underlying prints 24/5, so an unbounded `x*y=k` book is a standing gift to whoever is awake
when the underlying gaps.

```bash
cd contracts
forge test --match-contract XorrAquaBookFork --fork-url https://mainnet.base.org
```
