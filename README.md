# xorr — ETH Online 2026

A bot that trades your capital while you get on with your life. Non-custodial: your wallet, your
keys, and a **scoped on-chain permission** the bot trades inside — capped per day, venue-restricted,
time-boxed, and revocable in one tap.

Chain: **Base**. This repo is also the Base Build Camp submission.

## Sponsor integrations

| Sponsor | What it does here | Status |
|---|---|---|
| **Privy** | Auth + embedded wallets. The user identity and the wallet that signs are one object, so there is no second account system. Closes the app's largest security gap — the executor previously had no auth at all. | **server auth live** — every route 401s without a valid token, verified including a forged JWT |
| **1inch** | Swap routing and execution. The Route row names the protocols actually routed through instead of a fixed string. | 9 live tests passing against real Base routes |
| **The Graph** | Subgraph indexing delegation grants, revokes and spends, so the app reads its own history from the chain rather than trusting our database. | **DEPLOYED** — [studio](https://thegraph.com/studio/subgraph/xorr) · `api.studio.thegraph.com/query/1758741/xorr/v0.0.1` |

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
