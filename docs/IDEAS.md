# 100 ideas, ranked

Scored **impact × feasibility × fit**, each 1–5, product = 1–125.

- **Impact** — would a judge notice or care?
- **Feasibility** — buildable for real, here, with the credentials that exist?
- **Fit** — does it strengthen *this* pitch ("the permission is the product, and you can check
  every claim yourself"), or is it a feature from a different app?

Fit is doing the most work in this ranking. A pile of 100 disconnected features hurts a demo. Two
of the highest-*impact* ideas below score badly on fit and are deliberately near the bottom.

Nothing already built is listed. Motion ideas are constrained by `ui/mobile-ui/animations.md`,
which is unusually strict on purpose — it sanctions exactly two unbuilt animations and says
"anything beyond those two, don't". Both were already built, so this list proposes **no new
animation**, and the design entries are about typography, state and hierarchy instead.

## Tier S — build first (score ≥ 80)

| # | Idea | I | F | Fit | Score |
|---|---|---|---|---|---|
| 1 | **`/judge` — a live verification console.** Every claim the README makes, checked live in front of you: the contract read from chain, the subgraph queried, the cap counted, the audit chain re-hashed. Not a status page — a page that *re-runs the proof*. | 5 | 5 | 5 | **125** |
| 2 | **Alerts that actually fire.** The `alerts` table and both screens exist; nothing evaluates them. Wire an evaluator into the scheduler so a price alert is a real event with a real push. | 5 | 5 | 5 | **125** |
| 3 | **Emergency flatten — sell everything to USDC, one tap.** The kill switch stops the bot; nothing gets you *out*. Routes through `closePosition`, so a spending cap can never block an exit. | 5 | 4 | 5 | **100** |
| 4 | **Withdraw from Aave, user-signed.** Tier 4 can supply and deliberately cannot withdraw. Right now that exit exists only in a test. Give it a screen. | 4 | 5 | 5 | **100** |
| 5 | **Per-strategy spend sub-caps.** The delegation caps the day; nothing caps one strategy inside it, so a rebalance can eat a DCA's budget. Enforce at the executor and show it. | 4 | 5 | 5 | **100** |
| 6 | **Basenames.** Resolve and display a Base name for the wallet everywhere an address is shown. Base-native identity, five minutes of work, visible on every screen. | 4 | 5 | 5 | **100** |
| 7 | **Cost basis and realised P&L.** Positions record units and USD; nothing computes average entry or realised gain. This is the number a user actually wants. | 5 | 4 | 5 | **100** |
| 8 | **`/metrics` + real dependency health.** `/health` returns `ok:true` if the process is alive. Make it check Postgres, the RPC, 1inch and the subgraph, and report latency per dependency. | 4 | 5 | 4 | **80** |
| 9 | **Gas-balance guard for the delegate.** The bot pays its own gas. When that wallet runs dry every strategy fails with a confusing venue error. Detect it, block early, say so. | 4 | 5 | 4 | **80** |
| 10 | **Idempotency keys on every POST.** `strategy_runs.period_key` already proves the pattern works; nothing else has it. A retried grant or a double-tapped approve should be free. | 4 | 5 | 4 | **80** |

## Tier A — build next (score 48–79)

| # | Idea | I | F | Fit | Score |
|---|---|---|---|---|---|
| 11 | **Tier 5 — range accumulation (`grid`).** Buys lower and sells higher inside a band the user draws. Fifth rung of the ladder. | 4 | 4 | 4 | 64 |
| 12 | **A second price source, cross-checked.** 1inch's spot API against CoinGecko; disagree by more than a threshold and the app says so rather than picking one. | 4 | 4 | 4 | 64 |
| 13 | **Strategy backtest against real OHLC.** Agents have a backtest; strategies do not. "What would this DCA have done over 90 days" using the same feed the chart uses. | 4 | 4 | 4 | 64 |
| 14 | **Request ids + structured logs.** Every request gets an id, echoed in the response header and in every log line it produces. | 3 | 5 | 4 | 60 |
| 15 | **Portfolio value over time.** A real equity curve from the audit trail, not a sparkline of today. | 4 | 3 | 5 | 60 |
| 16 | **Trailing stop.** Exit rules can take profit and stop; a trailing stop is the one people actually ask for. | 4 | 4 | 4 | 64 |
| 17 | **"While you were away" card.** On open, what the bot did since you last looked — the product's whole premise, stated once. | 4 | 4 | 4 | 64 |
| 18 | **Circuit breaker on the RPC.** When the chain read fails repeatedly, stop hammering it and degrade honestly instead of timing out every request. | 3 | 5 | 4 | 60 |
| 19 | **Retry with backoff on every upstream.** Ad-hoc in places, absent in others. | 3 | 5 | 4 | 60 |
| 20 | **Tax-lot CSV export.** The audit trail is already the compliance artifact; make it produce the thing an accountant asks for. | 3 | 5 | 4 | 60 |
| 21 | **Graceful 1inch outage.** Quotes fail closed with a stated reason instead of an empty route row. | 3 | 5 | 4 | 60 |
| 22 | **Per-kind notification preferences.** Screen 18's toggles exist; nothing reads them server-side. | 3 | 5 | 4 | 60 |
| 23 | **Deep BaseScan links everywhere.** Every signature in the app is already a hash; make every one of them clickable. | 3 | 5 | 4 | 60 |
| 24 | **DB migrations, versioned.** `schema.sql` is applied by hand. | 3 | 5 | 3 | 45 |
| 25 | **Seed script for a cold demo.** One command from empty database to a demo-ready account. | 3 | 5 | 4 | 60 |
| 26 | **Error boundary per screen.** One thrown render currently takes the whole app to a red box. | 3 | 4 | 4 | 48 |
| 27 | **Offline banner.** The app assumes the executor is reachable. | 3 | 4 | 4 | 48 |
| 28 | **Tabular figures on every number.** Proportional digits make a live price jitter horizontally. A one-line fix on a screen people stare at. | 3 | 5 | 4 | 60 |
| 29 | **Empty states with a next action.** Several lists render an empty view that offers nothing to do. | 3 | 5 | 4 | 60 |
| 30 | **Long-press a candle for its OHLC.** The chart is the centrepiece and currently read-only. | 3 | 4 | 4 | 48 |
| 31 | **Sparkline in every market row.** `Sparkline.tsx` exists and the rows do not use it. | 3 | 4 | 4 | 48 |
| 32 | **Graceful shutdown.** SIGTERM should drain in-flight runs rather than abandon a claimed period. | 3 | 4 | 4 | 48 |
| 33 | **Request timeouts everywhere.** One hung upstream should not hold a connection open. | 3 | 5 | 3 | 45 |
| 34 | **CORS locked to known origins.** Currently permissive. | 3 | 5 | 3 | 45 |
| 35 | **Dockerfile + one-command up.** | 3 | 4 | 3 | 36 |
| 36 | **CI running the suite.** | 3 | 4 | 3 | 36 |

## Tier B — good, lower priority (score 24–47)

| # | Idea | I | F | Fit | Score |
|---|---|---|---|---|---|
| 37 | Tier 6 — momentum, with approve-before-execute on by default | 4 | 2 | 4 | 32 |
| 38 | Tier 7 — event-driven, flattening before earnings | 4 | 2 | 3 | 24 |
| 39 | EIP-5792 batch: grant + approve in one signature | 4 | 2 | 4 | 32 |
| 40 | Paymaster / sponsored gas for the first grant | 4 | 2 | 3 | 24 |
| 41 | Passkey login through Privy | 3 | 3 | 3 | 27 |
| 42 | A third subgraph indexing strategy runs | 3 | 3 | 4 | 36 |
| 43 | EAS attestation per strategy run | 3 | 2 | 4 | 24 |
| 44 | 1inch Fusion / intent orders | 4 | 2 | 4 | 32 |
| 45 | 1inch Limit Order Protocol | 4 | 2 | 4 | 32 |
| 46 | Chainlink feed as an independent third price | 3 | 3 | 3 | 27 |
| 47 | SwapVM program enforcing a TWAP window | 4 | 2 | 4 | 32 |
| 48 | SwapVM program with an oracle price band | 4 | 2 | 4 | 32 |
| 49 | xorr itself as an Aqua maker, quoting from idle inventory | 5 | 1 | 4 | 20 |
| 50 | Multi-wallet switching | 3 | 3 | 3 | 27 |
| 51 | Receive screen with a QR of the address | 3 | 4 | 3 | 36 |
| 52 | Copy a leaderboard agent's configuration | 3 | 3 | 3 | 27 |
| 53 | Strategy templates / one-tap presets | 3 | 4 | 3 | 36 |
| 54 | Weekly digest push | 3 | 3 | 3 | 27 |
| 55 | Pause/resume a strategy straight from a notification | 3 | 2 | 4 | 24 |
| 56 | Drift indicator on the holdings screen | 3 | 4 | 3 | 36 |
| 57 | Position-level notes | 2 | 4 | 3 | 24 |
| 58 | Day/time-of-day scheduling, not just cadence | 3 | 4 | 3 | 36 |
| 59 | "Buy the dip" modifier on DCA | 3 | 3 | 3 | 27 |
| 60 | Share a position as an image | 3 | 3 | 3 | 27 |
| 61 | Aave health factor, if borrowing is ever added | 2 | 3 | 3 | 18 |
| 62 | Corporate-action awareness on tokenized equities | 3 | 2 | 4 | 24 |
| 63 | Coinbase onramp funding | 4 | 2 | 3 | 24 |
| 64 | Backup / restore of the audit trail | 3 | 4 | 3 | 36 |
| 65 | A public status page | 2 | 4 | 3 | 24 |
| 66 | Live subgraph query panel in-app | 3 | 3 | 4 | 36 |
| 67 | Revoke-propagation latency measurement | 3 | 3 | 4 | 36 |
| 68 | Architecture diagram rendered in-app | 2 | 4 | 3 | 24 |
| 69 | Keyboard shortcuts on web | 2 | 4 | 2 | 16 |
| 70 | Onboarding resume where you left off | 3 | 3 | 3 | 27 |
| 71 | Screen-reader labels audited across every control | 3 | 4 | 3 | 36 |
| 72 | Pull-to-refresh on the lists that poll | 3 | 4 | 3 | 36 |
| 73 | A visual before/after of a rebalance | 3 | 3 | 3 | 27 |
| 74 | Connection-pool tuning | 2 | 4 | 3 | 24 |
| 75 | Secrets-never-logged audit | 3 | 4 | 3 | 36 |

## Tier C — considered and ranked low, with the reason

| # | Idea | Why it is down here |
|---|---|---|
| 76 | Social feed of other users' trades | Different product. Fit 1. |
| 77 | Leaderboard of human traders | Same. |
| 78 | In-app chat with support | Fit 1, and unbuildable honestly. |
| 79 | Referral program | Fit 1. |
| 80 | NFT of your best trade | Fit 1, and actively cheapens the pitch. |
| 81 | Points / XP / streaks | Gamifying a trading bot cuts against the whole trust argument. |
| 82 | Push a "market is moving!" nudge | Manufactured urgency. The product's premise is *not* watching. |
| 83 | Dark/light theme toggle | The design is black-only by specification. |
| 84 | Custom accent colour | Same. |
| 85 | Confetti on a profitable close | animations.md forbids it, and celebrating a win trains the wrong instinct. |
| 86 | Animated number counters | Explicitly banned: "never animate a price". |
| 87 | Staggered list entrance animations | Explicitly banned. |
| 88 | A pulsing "live" dot | Explicitly banned. |
| 89 | Voice control | Novelty; no judge scores it. |
| 90 | AI chat that can place trades directly | Removes the approval step the pitch is built on. |
| 91 | Auto-approve proposals above a confidence score | Same problem, worse. |
| 92 | Leverage / perps execution | Screen exists as read-only market data; executing it needs a venue and contradicts the ladder's ordering. |
| 93 | Cross-chain bridging | Base-native is the pitch. |
| 94 | Solana support | Removed in the pivot; re-adding is a regression. |
| 95 | Fiat off-ramp | Needs a partner and a licence. |
| 96 | Tax filing integration | Needs a partner. |
| 97 | Options strategies | Out of scope for the ladder. |
| 98 | Margin lending | Contradicts "risk-reducing only" as a design value. |
| 99 | A desktop app | No judge is scoring a second client. |
| 100 | Rewriting the executor in Rust | Zero judge-visible impact. |
