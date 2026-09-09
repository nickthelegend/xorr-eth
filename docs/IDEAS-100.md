# 100 ideas, ranked — and what was actually built

Written after reading the repo rather than from a template. The project is already large (about a
hundred screens, 307 server tests, five contracts, four sponsor integrations), so "add a feature"
is mostly the wrong move: the marginal win is in **closing the gaps the project's own audit
names**, in **proving claims a judge can check**, and in **the two or three moments a judge
remembers**.

Scoring is impact × feasibility × fit, each 1–5. Fit penalises anything that would clutter the
pitch — a hundred disconnected features hurt a demo as much as they help.

## The three facts that drive the ranking

1. `docs/SPONSOR-AUDIT.md` says it plainly: **no single deployment demonstrates the sponsor
   stack.** The fork has 170 real 1inch fills and an inert Graph; Sepolia has a load-bearing Graph
   that can never fill. A judge opens one URL and sees half the project.
2. The product's central claim is a **tamper-evident audit trail** — and its one permanent failure
   is a fork in that trail, which `/verify` correctly refuses to hide.
3. `COMPLETION.md` lists six unfinished items, of which two are environmental, two are platform
   constraints, one is permanent by design, and one is a missing credential.

---

## Tier 1 — build these (impact × feasibility × fit ≥ 60)

| # | Idea | I | F | Fit | Score |
|---|---|---|---|---|---|
| 1 | **Anchor the audit chain head on-chain.** The trail's integrity claim currently rests on our own database. Publishing the head hash to a Base contract on a cadence makes it checkable against the chain by anyone, and makes the existing fork *provably* historical rather than merely asserted. | 5 | 4 | 5 | 100 |
| 2 | **`/verify` reads the anchor from the chain** and reports "the trail matches the hash Base has held since block N". Turns the strongest claim into the most checkable one. | 5 | 4 | 5 | 100 |
| 3 | **First real SwapVM settled fill.** `COMPLETION.md` #3 — contract deployed, ten tests, never called. The maker exists now; make it settle and put it in the trail. | 5 | 3 | 5 | 75 |
| 4 | **Route comparison with real quotes side by side** — 1inch vs Aqua vs SwapVM for the same size, each priced live, with the winner and the reason. The 1inch track's own bar is Aqua/SwapVM; this shows all three competing. | 4 | 4 | 5 | 80 |
| 5 | **Anchor history screen** — every anchor, its block, its tx, and whether the local trail still hashes to it. | 4 | 4 | 4 | 64 |
| 6 | **Number roll-up motion** on every value that changes, so a live price or a filling balance reads as movement rather than a repaint. | 3 | 5 | 4 | 60 |
| 7 | **Price tick flash** — green/red wash on the digit that moved, decaying. Cheap, and it makes the whole app feel live. | 3 | 5 | 4 | 60 |
| 8 | **The route, drawn.** Venue hops as a graph with the amount flowing through it, instead of "via Uniswap V3, Aerodrome". | 4 | 4 | 4 | 64 |

## Tier 2 — build if time (30–59)

| # | Idea | I | F | Fit | Score |
|---|---|---|---|---|---|
| 9 | Gas-aware routing: compare venues **net of gas**, not just on quoted output. | 4 | 3 | 4 | 48 |
| 10 | Subgraph freshness widget: indexed block vs chain head, with the lag in seconds. | 3 | 4 | 4 | 48 |
| 11 | Cap-utilisation history from `dailySpends`, straight out of the index. | 3 | 4 | 4 | 48 |
| 12 | Privy policy engine shown refusing a transaction live, on the server-owned demo wallet. | 4 | 3 | 4 | 48 |
| 13 | Strategy dry-run: exactly what would happen, priced now, before you create it. | 4 | 3 | 4 | 48 |
| 14 | Spend-by-venue breakdown from the subgraph. | 3 | 4 | 4 | 48 |
| 15 | Chart draw-in animation on first paint. | 2 | 5 | 4 | 40 |
| 16 | Trail entries that stamp in showing their hash linking to the previous one. | 3 | 4 | 3 | 36 |
| 17 | Price-impact gate above a threshold, with the number and a confirm. | 3 | 4 | 3 | 36 |
| 18 | Agent A/B: two personas over the same window, same capital. | 3 | 3 | 4 | 36 |
| 19 | Reorg awareness: indexed vs finalised block. | 3 | 3 | 4 | 36 |
| 20 | Basename display for the bot key wherever the address appears. | 2 | 4 | 4 | 32 |

## Tier 3 — considered and ranked below the line (the remaining 80)

Grouped, with the reason each sits here. Several are good ideas that would make the demo *worse* by
crowding it, which is a fit score of 1 or 2 regardless of how interesting they are.

**Sponsor depth (21–40).** 1inch Fusion intent quotes alongside classic; limit orders via Aqua;
Aqua book depth chart; partial-fill handling; RFQ comparison; multi-hop split routing display;
1inch spot-price API as a third cross-check source; permit2 flow; approval-minimisation pass;
second subgraph deployed and queried *(blocked: `subgraph_create` is a Studio dashboard action, not
in the deploy API — `COMPLETION.md` #4)*; subgraph-powered cross-wallet leaderboard; query
latency panel proving the index beats RPC; entity-level subgraph diffing; Graph-sourced venue
allowlist history; Privy MFA state; Privy destination allowlist read live; Privy session keys
explainer; recovery flow on real Privy state; Base paymaster / sponsored gas; cbBTC-specific
strategy tier.

**Core functional (41–62).** Rebalancing tier; portfolio drift alerts; limit-order tier;
stop-loss ladders; trailing stops; DCA pause-on-drawdown; correlation view; concentration warnings;
scheduled email/push reports; multi-wallet switching surfaced in the UI; per-strategy P&L
attribution; venue performance scorecard; fill-quality measurement vs mid; slippage realised vs
quoted; per-agent risk budget; capital allocation across agents; "explain this fill" deep link;
tax-lot method selection; realised/unrealised split; paper-trading toggle; strategy templates
gallery; import/export strategy as JSON.

**Design and motion (63–84).** Permission "seal" animation on grant; kill-switch with a physical
throw; agent avatar micro-expressions per state; pull-to-refresh with real refetch; skeleton →
content crossfade; staggered list entrance; shared-element transition from row to detail; sparkline
morphing between timeframes; haptic feedback on commit actions; sound design for fills; dark/light
theme transition; parallax on the home header; confetti on first successful fill *(fit 1 — this
product's whole tone is "no overselling")*; loading states that name what they are waiting for;
progress ring on scheduled runs; countdown to next run; animated hash-chain visualiser; venue logos
with real brand assets; typographic scale pass; motion-reduced variants honouring the OS setting;
empty-state illustrations; iconography pass.

**Production readiness (85–100).** Per-screen error boundaries; offline detection and banner;
request-id surfaced in every error for support; rate-limit surfacing with retry-after honoured;
idempotency keys on every write; session-expiry handling with silent refresh; deep-link handling
for every route; accessibility audit and fixes; keyboard navigation on web; focus management in
modals; screen-reader labels on every control; colour-contrast pass; input validation messages;
optimistic-update rollback on failure; a health page that names each dependency and its last good
response; structured logging with correlation ids.

---

## What was actually built in this pass

Recorded honestly below as each one lands — built and verified, or not claimed.
