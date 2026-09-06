# xorr — honest completion

100% is defined by what this project itself claims: the design handoff's 26 screens
(`ui/mobile-ui/screens.md`), the strategy ladder's 7 tiers (`src/strategies/ladder.ts`, "do not
reorder this"), the four hackathon briefs, the README's own sponsor table, and the infrastructure
the product needs to exist at all.

Measured by running it, not by reading it. A feature that exists but is mocked, stubbed or
unreachable counts as NOT done.

## First measurement — 60 of 73 items · **82%**

### A. Design surface — 26 of 26 ✓
All 26 screens in `screens.md` are implemented across 41 routes, and all 47 routes passed a real
browser sweep with console and network checked on each: zero errors from this codebase, zero failed
requests.

### B. Strategy ladder — 3 of 7
| Tier | Kind | Available in UI | Executor |
|---|---|---|---|
| 1 Recurring buy | `dca` | yes | **yes** |
| 2 Rebalance | `rebalance` | yes | **yes** |
| 3 Take profit / stop loss | `exit-rules` | yes | **yes** |
| 4 Idle cash to yield | `yield-rotation` | no | no |
| 5 Range accumulation | `grid` | no | no |
| 6 Momentum | `momentum` | no | no |
| 7 Events and earnings | `event-driven` | no | no |

Tiers 4–7 are honestly marked unavailable, so nothing in the UI lies — but they are four sevenths
of the ladder the product is built around.

### C. Sponsor requirements — 9 of 10
Privy auth, Privy embedded wallet as on-chain owner, 1inch aggregator routing and execution, Aqua
official contracts, Aqua on-chain token movement, SwapVM, the delegation subgraph, and Base-native
settlement all verified. **The Aqua subgraph is built and pinned but not deployed.**

### D. Infrastructure — 4 of 10
| Item | Status |
|---|---|
| Real persisted Postgres | ✓ 12 tables, live rows |
| `XorrDelegation` on a public chain | ✓ Base Sepolia, 14,317 bytes |
| Delegation subgraph deployed and synced | ✓ |
| Scheduler runs unattended | ✓ `[scheduler] scheduler proof: filled` |
| `XorrAquaBook` on a public chain | ✗ fork only — Aqua is Base-mainnet-only |
| `XorrSwapVMBook` on a public chain | ✗ same |
| Aqua subgraph deployed | ✗ needs a Studio slug |
| Executor reachable off localhost | ✗ |
| Native iOS build runs | ✗ |
| Native Android build runs | ✗ never attempted |

### E. Integrations — 11 of 12
Privy, 1inch quote, 1inch execution, Aqua, SwapVM, the delegation index, CoinGecko, Aave v3, the
RSS briefing and the Ondo equities all verified live. **The Graph composition is partial**: the
join is written and exercised, but the second index is unreachable, so every route resolves to the
aggregator and says so.

### F. Core product claims — 7 of 8
Non-custodial, the on-chain daily cap, expiry, the venue allowlist, the kill switch working without
the server, every price real or labelled, and the scheduler trading unattended — all verified.

**"The bot interrupts you when it matters" is not wired.** `src/notifications/register()` exists
and is called by no screen, so no device ever registers; `server/src/notifications/push.ts::send()`
exists and fires only from `/notify/test`, never from a fill, a block or a stop. The Inbox screen
and the whole of the design's screen 18 are built around an event path that does not connect.
