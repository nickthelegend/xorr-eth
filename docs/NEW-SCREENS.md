# New screens

Thirty-three screens, none of which touch an existing one.

The rule that shaped the whole list: **a screen with no real data behind it is a mock**, so every
row below names the endpoint, table or contract call it renders. Nothing here invents a number, and
nothing here is a design study — if the data did not already exist, the screen is not on the list.

That constraint turned out to be the useful one. The app has ~70 endpoints and 19 tables behind 44
screens, and the gap is not evenly spread: the parts with no UI are almost entirely the parts that
make the product's central claim checkable. There is an on-chain approval surface, a hash-chained
audit trail, a policy engine, a subgraph and a verification harness — and until now, no way to look
at any of them from the phone.

## A · Trust, and how to check it

| Screen | Renders | Source |
|---|---|---|
| `/verify` | Every claim the README makes, run live, each green or red | `GET /verify` |
| `/audit/chain` | The hash chain, and whether it still verifies end to end | `GET /activity/verify` |
| `/audit/[seq]` | One entry: action, amount, prev-hash link, signature, explorer | `GET /activity` |
| `/approvals` | What the delegation may pull, per token, and which are unlimited | `GET /approvals` — on-chain `allowance()` |
| `/policy` | Whether Privy's policy engine is enforcing, and what it would allow | `GET /privy/policy` |
| `/keys` | Agent API keys, their scopes, and revocation | `GET/POST/DELETE /agent/keys` |
| `/delegation` | Contract, delegate, venues, every token it may touch, expiry | `GET /delegation` + `/delegation/params` |

## B · Money

| Screen | Renders | Source |
|---|---|---|
| `/pnl` | Realised profit and loss | `GET /pnl/realised` |
| `/disposals` | Every disposal, cost basis and gain, with CSV export | `disposals` + `GET /pnl/disposals.csv` |
| `/limits` | Daily cap, spent today, what is left | `GET /limits` |
| `/allocation` | Where the money actually sits, by class | `GET /positions` + `/market/quotes` |

## C · Markets

| Screen | Renders | Source |
|---|---|---|
| `/movers` | Today's largest moves, both directions | `GET /market/quotes` |
| `/compare` | Two instruments side by side over one range | `GET /market/ohlc` |
| `/crosscheck/[symbol]` | The same asset priced two ways, and the gap | `GET /market/crosscheck` |
| `/token/[symbol]` | Address, decimals, where the logo came from, whether it settles | `/market/tradable` + `/market/logos` |
| `/route/[symbol]` | The protocols a fill would actually route through | `GET /swap/quote` |
| `/oracle/[symbol]` | Every price this executor has recorded | `price_observations` |

## D · Agents and strategies

| Screen | Renders | Source |
|---|---|---|
| `/agent/[id]` | One agent: mandate, state, its own record | `GET /agents/:id` |
| `/runs` | Every strategy run, and what it did or refused | `strategy_runs` |
| `/runs/[id]` | One run: inputs, decision, fill or reason | `strategy_runs` |
| `/proposals` | Every proposal, approved, skipped or expired | `GET /proposals` |
| `/strategy/[id]` | One live strategy: parameters, runs, spend | `GET /strategies/:id` |
| `/strategy/momentum` | Create a momentum strategy — a kind with no creator | `POST /strategies` |
| `/strategy/event` | Create an event-driven strategy — likewise | `POST /strategies` |
| `/backtest` | What a strategy would have done, before committing | `POST /strategies/backtest` |

## E · Infrastructure

| Screen | Renders | Source |
|---|---|---|
| `/graph` | Subgraph health and how far behind the head it is | `GET /graph/health` |
| `/graph/spends` | Spend events as the subgraph indexed them | `GET /graph/activity` |
| `/graph/decision` | Which venue the router picks for a size, and why | `GET /graph/decision` |
| `/network` | Chain, block, gas, RPC, contract | `GET /health` |
| `/status` | The executor and every dependency it needs | `GET /health` |

## F · Identity

| Screen | Renders | Source |
|---|---|---|
| `/basename` | Basename ↔ address, both directions | `GET /basename` |
| `/profile` | This wallet: address, basename, what it has done | `/wallet` + `/activity` |

## G · Everything else

| Screen | Renders | Source |
|---|---|---|
| `/catchup` | What happened since you last looked | `GET /catchup` |
| `/notifications` | Which events are worth waking you for | `GET/PATCH /notifications/prefs` |
| `/explore` | The index for all of the above | — |

## Not built, and why

These were on the list and came off it, because there is no real source:

- **Social / copy-trading.** No other users exist. A leaderboard of one is a mock.
- **Order book depth.** 1inch is an aggregator; there is no book to show.
- **News sentiment.** The feed has headlines, not scored sentiment. Scoring them here would be
  inventing the number the screen exists to display.
- **Portfolio performance over time.** `price_observations` records what the executor priced, not a
  daily mark of the whole portfolio. Drawing a curve from it would imply a history nobody kept.
