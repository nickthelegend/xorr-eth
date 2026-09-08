# Test plan — the fifty new screens

Phase 1 of the standing goal, scoped to what this run added. The 44 pre-existing screens were
covered by `docs/TESTPLAN-RUN.md`; this is the surface that has never been executed in a browser.

**What PASS means here, for every item without exception:**

1. The route renders its own content — not a blank screen, not a spinner that never resolves.
2. It reaches its stated data source and renders the real answer, OR renders its stated
   empty/error state. Both are passes; a screen that shows nothing and says nothing is a fail.
3. **Zero console errors** on that route. Third-party dev warnings (styled-components) are noted
   and excluded; anything from our own code is a fail.
4. **Zero failed network requests** attributable to the screen. A 401 on a wallet-scoped route in a
   signed-out session is a pass *if* the screen renders its error state rather than hanging.
5. Every number carries its provenance where the screen promised one (source, feed, disclaimer).

A screen that cannot reach real data because the dependency genuinely is not there is marked
**UNTESTABLE** with the reason — never PASS.

## Environment under test

| | |
|---|---|
| Client | `http://localhost:8082` — Expo web build |
| Executor | `http://localhost:8788` — chain `base-sepolia` |
| Wallet | signed in via Privy, wallet-scoped routes authorised |

Chain matters: on `base-sepolia` 1inch has no liquidity, so route/quote screens are expected to
report no route. That is the correct answer on this chain, and a screen claiming otherwise fails.

## Items

### A · Proof (7)

| # | Route | Correct means |
|---|---|---|
| A1 | `/verify` | 20 rows, each with claim + `how` + `observed`; tallies sum to 20; failures red, skips grey |
| A2 | `/audit/chain` | States unbroken or broken with an entry count; offers no repair |
| A3 | `/audit/[seq]` | One entry with action, detail, and either a tx or the "no transaction" explanation |
| A4 | `/approvals` | Per-token allowance from chain; unlimited flagged; raw uint256 shown in full |
| A5 | `/policy` | Enforcing or not-attached as distinct states; destinations listed |
| A6 | `/delegation` | State (live/revoked/expired/stale key), cap, expiry, venues |
| A7 | `/keys` | Key list with scopes, or the empty state; explains why a key cannot be re-shown |

### B · Money (8)

| # | Route | Correct means |
|---|---|---|
| B1 | `/pnl` | Total realised + per-symbol; `basisIncomplete` counted, not hidden |
| B2 | `/disposals` | One row per sale; cost shown or dashed with the per-row warning |
| B3 | `/limits` | Cap, spent, remaining; bar proportional; zero-cap does not render a full bar |
| B4 | `/allocation` | Slices sum to the total; cash included; percentages from the same figures |
| B5 | `/balance` | Cash + held + supplied; three-segment bar |
| B6 | `/spend` | Daily totals from the subgraph, bars scaled to peak |
| B7 | `/rates` | Aave APY as a percentage (fraction × 100), `feed` stated |
| B8 | `/export` | Two documents offered; share sheet opens; empty file reported as empty |

### C · What the bot did (6)

| # | Route | Correct means |
|---|---|---|
| C1 | `/runs` | Runs listed; filters work; refusals shown at equal weight to fills |
| C2 | `/runs/[id]` | One run with its reason verbatim; out-of-window run says so |
| C3 | `/proposals` | History with approved/skipped/expired; past-expiry undecided reads expired |
| C4 | `/catchup` | Counts + entries since last seen; acknowledge is explicit |
| C5 | `/schedule` | Live strategies ordered by next run; overdue distinct from upcoming |
| C6 | `/backtest` | Runs on real closes; renders source + disclaimer; no history → stated |

### D · Markets (10)

| # | Route | Correct means |
|---|---|---|
| D1 | `/movers` | Up and down sections, ranked by magnitude, across all classes |
| D2 | `/tokens` | Settleable tokens with full addresses and decimals |
| D3 | `/compare` | Two normalised series; gap in *points*, not percent |
| D4 | `/crosscheck/[symbol]` | Agree / disagree / only-one-source as three distinct states |
| D5 | `/route/[symbol]` | Route venues at a chosen size, or the no-route answer on Sepolia |
| D6 | `/oracle/[symbol]` | Observed readings + `observedSince`; empty state names why |
| D7 | `/stocks` | Equities priced by probe; `unavailable` rows kept, not dropped |
| D8 | `/earnings` | EDGAR filings; next date labelled a projection with error days |
| D9 | `/coverage` | Three groups; the priced-only group is non-empty on this build |
| D10 | `/funding` | Per-perp mark/oracle; nulls as dashes, never zeros |

### E · Agents (5)

| # | Route | Correct means |
|---|---|---|
| E1 | `/agent/[id]` | Mandate, 30d figures, disclaimer, run tally with its attribution caveat |
| E2 | `/roster-compare` | Four agents with figures; disclaimer once |
| E3 | `/risk` | Per-agent limits, or the empty state explaining what still constrains them |
| E4 | `/voice` | Three tones with the real model instruction; selection persists |
| E5 | `/bot` (chat) | Agent rail switches; reply attributed to the chosen agent |

### F · Infrastructure (8)

| # | Route | Correct means |
|---|---|---|
| F1 | `/status` | Executor state + every dependency with latency and criticality |
| F2 | `/network` | Chain named with its consequence; block; contract |
| F3 | `/graph` | Indexed block + healthy flag + distance behind head |
| F4 | `/graph/spends` | Spend events with full tx hashes, or empty state |
| F5 | `/graph/decision` | Decision object rendered generically per size |
| F6 | `/metrics` | Runs/strategies/alerts/spend counted; states it is deployment-wide |
| F7 | `/sources` | Seven sources; the probed ones show live state |
| F8 | `/venues` | Allowlisted venues + pullable tokens, addresses in full |

### G · Identity and settings (6)

| # | Route | Correct means |
|---|---|---|
| G1 | `/basename` | Both directions; unresolved says so, never echoes the query |
| G2 | `/profile` | Address in full, basename or "No name", activity counts |
| G3 | `/notifications` | Four kinds from the server; toggle writes |
| G4 | `/sell-everything` | Legs + total + dust threshold stated |
| G5 | `/alert/[id]` | Armed vs fired-and-waiting; fire count |
| G6 | `/explore` | All 41 links present; every one resolves |

**Total: 50 items.**
