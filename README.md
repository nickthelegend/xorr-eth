# xorr

**A bot that trades your capital while you get on with your life.**

Non-custodial. Your wallet, your keys, and a **scoped on-chain permission** the bot trades inside —
capped per day, venue-restricted, time-boxed, and revocable in one tap without our cooperation.

Chain: **Base**. ETH Online 2026 · Base Build Camp 2026.

<p align="center">
  <img src="docs/screens/07-home.png" width="240" alt="Home" />
  <img src="docs/screens/18-chart.png" width="240" alt="Chart" />
  <img src="docs/screens/05-delegate.png" width="240" alt="Delegate" />
</p>

---

## Check it yourself

Everything below is a claim. `/judge` in the app — and `GET /verify` behind it, which needs no
account — re-runs fifteen of them live: the contract read from the chain, the subgraph queried, the
venue allowlist tested against a control address, the audit chain re-hashed, the price feeds
cross-checked. Each row shows what was observed and the call that produced it, so it can be
repeated somewhere this code cannot reach.

```bash
curl -s "localhost:8788/verify?owner=0xYourAddress" | jq '.passed, .failed'
```

<p align="center">
  <img src="docs/screens/32f-judge.png" width="240" alt="The verification console" />
  <img src="docs/screens/32c-strategy-grid.png" width="240" alt="Range accumulation" />
  <img src="docs/screens/32e-flatten.png" width="240" alt="Sell everything" />
</p>

## The idea in one paragraph

Handing a bot your money is a trust problem, not a trading problem. So the permission is the
product: `XorrDelegation` is a contract you grant, that caps what the bot can spend per day,
restricts it to venues you allowlisted, expires on its own, and **cannot move funds to an address
of the bot's choosing**. Revoking needs one signature from you and nothing from us. Everything the
bot does is then readable back off the chain through The Graph, so the history you check is not a
history we hold.

## Live deployment

| | |
|---|---|
| `XorrDelegation` | [`0xb14CF3D0b5269aCDE52322218adb6d5C1daE0a4e`](https://sepolia.basescan.org/address/0xb14CF3D0b5269aCDE52322218adb6d5C1daE0a4e) on Base Sepolia |
| Delegation subgraph | [`api.studio.thegraph.com/query/1758741/xorr/v0.0.2`](https://api.studio.thegraph.com/query/1758741/xorr/v0.0.2) — synced, no indexing errors |
| Aqua venue subgraph | built + pinned `QmctadHCDBprb9Q1Pq4oyMXjB6KcnUDHRheDRNyBA59tAJ` |
| Bot delegate key | `0xe992FE56589d1111d0b7Bb7c4Ca3946d4d53E403` |

A real grant signed by a real Privy embedded wallet is queryable right now:
[`0x596f4c08…`](https://sepolia.basescan.org/tx/0x596f4c08eca02e0d4dd0928e7499c4cccad31461c35e5b98e2f5bf211595ee6d)
— $1,600/day cap, 1inch router allowlisted, everything else denied.

## Two environments, and why there are two

Aqua, 1inch and the tokenized equities exist only on Base **mainnet**. `XorrDelegation` is deployed
to Base **Sepolia**, where anyone can grant and revoke for real without spending money.

- **Base Sepolia** proves the permission layer: a real embedded wallet signs a real `grant`, the cap
  is enforced on-chain, revoke stops the bot, the subgraph indexes all of it. It **cannot fill a
  trade** — there is no 1inch there — and the executor says so rather than trying.
- **Base mainnet fork** proves settlement: real router, real USDC, real Aave, real equity tokens,
  real fills. Everything genuine except that the chain is a local copy.

Nothing in this repo is claimed to work in an environment where it was not run.

## Sponsor integrations

| Sponsor | What it does here | Status |
|---|---|---|
| **Privy** | Auth + embedded wallets. The identity and the wallet that signs are one object, so there is no second account system — and the wallet Privy creates is the `owner` in the on-chain policy. | **Done.** Real login → real embedded wallet → real signed grant, revoke and approval |
| **1inch — Aqua** | `XorrAquaBook` is an Aqua app on the official deployment. A market maker keeps shares and USDC in their own wallet and quotes anyway — which is what makes an illiquid tokenized equity tradable at all. | **Done.** 22 fork tests against `0x1111113CCf…` with real ERC-20 movement |
| **1inch — Aggregator** | Swap routing and execution. The Route row names the protocols actually routed through. | **Done.** Real fills on a Base mainnet fork |
| **1inch — SwapVM** | `XorrSwapVMBook` compiles the terms of a trade into SwapVM program bytecode — a deadline, a slippage floor, a fee, a salt — so the *rules* of the fill are enforced inside the VM rather than trusted to whoever submits it. | **Done.** 10 fork tests, including behavioural guards that prove the deadline really expires and the fee really costs |
| **The Graph** | Two independent subgraphs, joined. One indexes our delegation contract (what you permitted); one indexes 1inch Aqua on Base mainnet (what liquidity exists). The **join picks the venue** — neither index can see the other's half. | Delegation index **deployed + synced**; Aqua index **built, awaiting a Studio slug** |
| **Aave v3** | Tier 4's venue. Idle USDC is supplied through the same delegation, under the same daily cap and the same venue allowlist — and the aToken goes straight to the user, because `supply()` names the recipient. | **Done.** 18 fork assertions, including that the bot *cannot* withdraw |
| **Base** | Everything settles here. Tokenized equities, cbBTC, Aave, 1inch — all Base-native. | **Done** |
| **Basenames** | Base's own naming, resolved against the L2 resolver — not ENS, which answers on the wrong chain. The safety screen names both parties to the permission rather than showing two truncated hexes that look identical in the middle. | **Done.** `jesse.base.eth` ⇄ `0x2211d1D0…` both directions |

## The core primitive

`contracts/src/XorrDelegation.sol` — every constraint enforced **by the contract**, not by us:

- daily cap, resetting on the UTC day boundary
- expiry (screen 5's "Run For")
- venue allowlist — the bot trades at approved venues and **cannot send funds anywhere it chooses**
- `revoke()` needs only the owner's signature: no server, no oracle, no cooperation from the bot

It never custodies. It pulls exactly the approved amount at the moment of a trade, forwards it, and
leaves no standing approval behind. Bought tokens go **straight to the user's wallet**, never to the
contract.

## What is actually real

| | |
|---|---|
| Prices | CoinGecko for crypto; a live 1inch route for the tokenized equities, because what you pay is what routes — not the NYSE print |
| Yield | `currentLiquidityRate` read from the Aave v3 Pool on Base |
| Fills | 1inch Aggregation Router v6, and `XorrAquaBook` on official Aqua |
| History | The Graph, indexed from the contract's own events |
| Permission | On-chain, signed by the user's embedded wallet |
| Markets | 17 of 44 instruments have a real feed. **The other 27 are tagged SIMULATED on screen.** |

**The rule that settles arguments:** every price on screen is real, or it is labelled. A confident
wrong number is the worst outcome available — that rule has caught eight bugs in this repo, most
recently a cross-check that fell back to WETH's address and priced BTC as ether.

Prices are checked against a second, independent source: 1inch's spot API, derived from the pools a
fill would actually touch. Measured live, the two agree within 0.03% on ETH and 0.02% on cbBTC. The
asset screen mentions it only when they disagree — a line saying "two sources agree" on every asset
every day is noise that trains people to stop reading.

## The strategy ladder

Ordered by how much the bot has to be right about the future, not by how impressive it sounds. Five
of seven rungs run.

| | What it does | Why it sits here |
|---|---|---|
| **1 · Recurring buy** | A fixed amount into one asset on a schedule. | No forecast. You can check every run against a calendar. |
| **2 · Rebalance** | Holds your sleeves at the weights you approved, trading only the drift. | Deterministic. The only input is your own target. |
| **3 · Take profit, stop loss, trailing stop** | Closes a position at levels you set. It never opens one. | Risk-reducing only. The trailing stop follows the high-water mark, updated on every run — including the ones where it does nothing, which is when trailing has to happen. |
| **4 · Idle cash to yield** | Supplies spare USDC to Aave v3. | Every move is a published rate you can check. The bot can supply and deliberately **cannot withdraw** — burning your own aTokens needs nobody's permission, so that power was never granted. |
| **5 · Range accumulation** | Buys a rung lower and sells a rung higher inside a band you draw. | The first tier that assumes something — that the range holds. So the setup screen backtests exactly that against real history before you commit. |
| 6 · Momentum | — | Not built. The first tier that needs the bot to be right about the future. |
| 7 · Events and earnings | — | Not built. Most judgement, most ways to be wrong, last. |

Every tier runs through the same `spend()` or `closePosition()` — one set of gates, checked once.
A tier with a screen and no executor is worse than no tier, so `available` is flipped only after
the executor has actually run it.

## When it goes wrong

| | |
|---|---|
| A trade is blocked | The cap, expiry or allowlist refused it. Said in plain language, pushed to your phone, and written to the trail — silence there looks identical to the bot not trying. |
| The bot runs out of gas | Caught before anything is signed, so the run blocks with the true reason instead of failing inside the venue call as "the venue rejected the order". |
| The price moves mid-flight | The delegation bubbles the venue's own revert instead of replacing it, so 1inch's `ReturnAmountIsNotEnough` becomes "the price moved more than your slippage limit". |
| A dependency goes down | Four consecutive failures open a per-host circuit breaker for 30s. Every screen already handles a failed read; they now get there in milliseconds instead of twenty-five seconds. |
| A screen throws | Contained to that screen. The tab bar keeps working and the kill switch stays one tap away. |
| The executor is killed mid-run | It drains first. Anything it could not finish is reconciled at the next boot and **not retried** — a run that may have signed and lost its receipt must never be repeated. |
| You want out entirely | "Sell everything" closes every position into USDC through `closePosition`, so a spending cap can never block an exit. |

## Every screen

53 screens, captured at the design canvas (402×874) against a signed-in session. The same sweep
checks the console and the network on every route and currently reports **zero errors and zero
failed requests** across all 53. Regenerate with `node tools/shoot.mjs`.

### Onboarding
| | | | |
|---|---|---|---|
| **Welcome** `/welcome`<br/><img src="docs/screens/01-welcome.png" width="180"/> | **Goals** `/goals`<br/><img src="docs/screens/02-goals.png" width="180"/> | **Wallet** `/wallet`<br/><img src="docs/screens/03-wallet.png" width="180"/> | **Fund** `/fund`<br/><img src="docs/screens/04-fund.png" width="180"/> |
| **Delegate** `/delegate`<br/><img src="docs/screens/05-delegate.png" width="180"/> | **Proposal** `/proposal`<br/><img src="docs/screens/06-proposal.png" width="180"/> | | |

### Home and markets
| | | | |
|---|---|---|---|
| **Home** `/`<br/><img src="docs/screens/07-home.png" width="180"/> | **Markets** `/markets`<br/><img src="docs/screens/08-markets.png" width="180"/> | **Crypto** `/markets/crypto`<br/><img src="docs/screens/09-markets-crypto.png" width="180"/> | **Stocks** `/markets/stocks`<br/><img src="docs/screens/10-markets-stocks.png" width="180"/> |
| **Commodities**<br/><img src="docs/screens/11-markets-commodities.png" width="180"/> | **Indices**<br/><img src="docs/screens/12-markets-indices.png" width="180"/> | **Pre-IPO**<br/><img src="docs/screens/13-markets-preipo.png" width="180"/> | **Watchlist** `/watchlist`<br/><img src="docs/screens/14-watchlist.png" width="180"/> |
| **Search** `/search`<br/><img src="docs/screens/15-search.png" width="180"/> | **Asset** `/asset/BTC`<br/><img src="docs/screens/16-asset.png" width="180"/> | **Asset — stock**<br/><img src="docs/screens/17-asset-stock.png" width="180"/> | **Chart** `/chart/BTC`<br/><img src="docs/screens/18-chart.png" width="180"/> |

### Trading
| | | | |
|---|---|---|---|
| **Order** `/order/WETH`<br/><img src="docs/screens/19-order.png" width="180"/> | **Order — stock**<br/><img src="docs/screens/20-order-stock.png" width="180"/> | **Swap** `/swap`<br/><img src="docs/screens/21-swap.png" width="180"/> | **Perp** `/perp/BTC`<br/><img src="docs/screens/22-perp.png" width="180"/> |
| **Position** `/position/:id`<br/><img src="docs/screens/23-position.png" width="180"/> | **Auto Close**<br/><img src="docs/screens/24-auto-close.png" width="180"/> | | |

### Agents
| | | | |
|---|---|---|---|
| **Bot** `/bot`<br/><img src="docs/screens/25-bot.png" width="180"/> | **Roster** `/bot/roster`<br/><img src="docs/screens/26-bot-roster.png" width="180"/> | **Leaderboard**<br/><img src="docs/screens/27-bot-leaderboard.png" width="180"/> | **Agent intro**<br/><img src="docs/screens/28-bot-intro.png" width="180"/> |
| **Agent settings**<br/><img src="docs/screens/29-bot-settings.png" width="180"/> | **Backtest**<br/><img src="docs/screens/30-bot-backtest.png" width="180"/> | | |

### Strategies and portfolio
| | | | |
|---|---|---|---|
| **Strategies** `/strategies`<br/><img src="docs/screens/31-strategies.png" width="180"/> | **Recurring buy**<br/><img src="docs/screens/32-strategy-dca.png" width="180"/> | **Assets** `/holdings`<br/><img src="docs/screens/33-holdings.png" width="180"/> | **Activity** `/activity`<br/><img src="docs/screens/34-activity.png" width="180"/> |
| **Idle cash to yield** `/strategy/yield`<br/><img src="docs/screens/32b-strategy-yield.png" width="180"/> | **Range accumulation** `/strategy/grid`<br/><img src="docs/screens/32c-strategy-grid.png" width="180"/> | **Earning at Aave** `/yield`<br/><img src="docs/screens/32d-yield-position.png" width="180"/> | **Sell everything** `/flatten`<br/><img src="docs/screens/32e-flatten.png" width="180"/> |
| **Check it yourself** `/judge`<br/><img src="docs/screens/32f-judge.png" width="180"/> | **History** `/history`<br/><img src="docs/screens/35-history.png" width="180"/> | **Briefing** `/briefing`<br/><img src="docs/screens/36-briefing.png" width="180"/> | **Inbox** `/inbox`<br/><img src="docs/screens/37-inbox.png" width="180"/> |

### Safety and settings
| | | | |
|---|---|---|---|
| **Safety** `/safety`<br/><img src="docs/screens/38-safety.png" width="180"/> | **Settings** `/settings`<br/><img src="docs/screens/39-settings.png" width="180"/> | **Alerts** `/alerts`<br/><img src="docs/screens/40-alerts.png" width="180"/> | **New alert**<br/><img src="docs/screens/41-alerts-new.png" width="180"/> |
| **Allowlist** `/allowlist`<br/><img src="docs/screens/42-allowlist.png" width="180"/> | **Send** `/send`<br/><img src="docs/screens/43-send.png" width="180"/> | **Recovery** `/recovery`<br/><img src="docs/screens/44-recovery.png" width="180"/> | **Legal** `/legal/:doc`<br/><img src="docs/screens/45-legal.png" width="180"/> |

### Design harness
| | |
|---|---|
| **Components** `/_dev/components`<br/><img src="docs/screens/46-dev-components.png" width="180"/> | **Fidelity** `/_dev/fidelity`<br/><img src="docs/screens/47-dev-fidelity.png" width="180"/> |

### On a real Android build

The shots above are the web build. These are the same app compiled to a native APK and running on
an emulator — same routes, same code, and a genuine Privy embedded wallet created on the device.
It is worth showing separately because three bugs existed **only** here: `jose` resolving its Node
build under React Native, Privy's polyfills never being installed, and `motionDuration` being
called across the worklet boundary. None of them can happen on web.

| | | | |
|---|---|---|---|
| **Welcome**<br/><img src="docs/screens/android/01-launch.png" width="150"/> | **Sign in**<br/><img src="docs/screens/android/07-otp.png" width="150"/> | **Wallet created**<br/><img src="docs/screens/android/08-wallet.png" width="150"/> | **Home**<br/><img src="docs/screens/android/10-home.png" width="150"/> |
| **Ladder**<br/><img src="docs/screens/android/12-tier4.png" width="150"/> | **Idle cash to yield**<br/><img src="docs/screens/android/13-yield-setup.png" width="150"/> | | |

The last one is worth reading closely: the wallet is brand new, so spendable cash is $0.00 and the
preview says **"would move: nothing"** rather than showing the configured $250. That is the screen
telling the truth about a wallet it cannot sweep.

## Running it

```bash
cp .env.example .env        # fill in Privy, 1inch, Graph keys
createdb xorr_eth && psql xorr_eth -f server/src/db/schema.sql
npm install && (cd server && npm install)

npx tsx server/src/index.ts  # executor on :8788
npx expo start --web         # app on :8082
```

For fills, run against a Base mainnet fork — the only environment where every piece is real at once:

```bash
anvil --fork-url https://mainnet.base.org --port 8545 --chain-id 8453
XORR_CHAIN=base-fork FORK_RPC=http://127.0.0.1:8545 npx tsx server/src/fork-e2e.ts WETH
```

## Tests

```bash
npm test                              # 143 app
(cd server && npm test)               # 42 executor
(cd contracts && forge test)          # 36 contract, incl. 22 Aqua fork tests
npm run test:live                     # real APIs, real chain
```

`docs/BASE-BUILD-CAMP.md` is the same work framed for that submission.
`docs/TESTPLAN.md` is the executed plan — every item PASS/FAIL with its evidence.
`PLAN.md` is what is left to build, with every gap tied to the task it blocks.

## Repo map

```
app/           41 expo-router screens
src/           design system, charts, data layer, state
server/        Hono executor — auth, scheduler, venues, Graph clients
contracts/     XorrDelegation, XorrAquaBook (Foundry)
subgraph/      delegation index      → deployed
subgraph-aqua/ Aqua venue index      → built
docs/          TESTPLAN, SECURITY, RUNBOOK, screens
ui/            the original design handoff, kept as the reference
```
