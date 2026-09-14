# xorr test plan — every component and flow, with what correct means

Written 2026-09-14, before this run's testing, as the checklist everything is measured against. Each item has an id, the
surface that proves it, an exact definition of correct, and a status. A status is only ever one of:

- **PASS** — observed on the real product, matching the definition exactly, with no console error and no failed request
  (4xx/5xx other than the documented `503 warming` handshake) on that item.
- **FAIL** — observed, and something differed. The fix (commit) and the re-run are recorded against the item.
- **UNTESTED** — could not be exercised for a stated reason (a credential or device this run does not have, real money,
  or a step only the owner may take). Never used to hide a failure.
- **NOT BUILT** — the item describes something the product does not do yet (it is on docs/FEATURES.md).

What "real" means here: the hosted web app (https://app.xorr.finance, Vercel), the two hosted executors
(https://executor-fork-production.up.railway.app on the Base mainnet fork, https://api.xorr.finance on Base Sepolia),
their real databases, the deployed contracts, and the real third-party APIs with the credentials already configured.
Nothing is mocked. The test account is `test-8958@privy.io`, wallet `0x95A0b368588713011a15f4b1041423f31B08e615`.

## Surfaces and who can drive them

| Surface | How it is driven | Limits |
| --- | --- | --- |
| **Web, signed out** | Claude in Chrome on app.xorr.finance; console via the extension, network via `performance.getEntriesByType('resource')` (status per request) | none |
| **Web, signed in** | Claude in Chrome after the owner signs in in that browser | This run never types an email code or credential into a browser or UI. Until the owner signs in there, signed-in web items are proven on the next surface and marked `web: UNTESTED (owner sign-in)` |
| **Native, signed in** | The iOS Simulator (iPhone 17 Pro) running the Debug build against Metro, pointed at the fork executor, already signed in as the test account; deep links `xorr://<route>`, screenshots, Metro's device log | Face ID is not enrolled, so the biometric prompt is skipped by the app's own rule |
| **API** | `tools/qa-full.mjs` against each executor with a real Privy access token for the test account (`server/src/e2e-token.ts`) | Routes that trade, sign, push, call a paid model or need operator keys run through their refusals only (the script's `NOT_EXECUTED` list) |
| **Chain** | Reads from the fork RPC (https://base-fork-production.up.railway.app) and Base Sepolia; proofs on a local anvil forked from the hosted fork (`tools/prove-stop-without-server.ts`, `tools/prove-user-signing.ts`) | Mainnet is never written. Real money is never spent |

## Global rules — true of every item

- **G1 Signed out.** Every private route shows the one-line sign-in prompt (`Sign in to see this.` + `Sign in`, or the
  screen's own signed-out line) and requests no private endpoint: the network log has no `401`.
- **G2 A failed read is a failure.** An unreadable value renders as `—` or the error state with `Try again`; never `$0`,
  `None`, an empty list, `Not granted` or a fixture. Under a server fault or timeout the error shows `Ref xxxxxxxx`.
- **G3 Words.** No emoji, no `!`; at most one short line per section; no chain, venue or vendor name on a main screen (the
  network chip appears only where money moves: Deposit and Send); percentages of a whole are unsigned; green/red only for
  profit and loss.
- **G4 Console and network.** No console error on load or on any control; no 4xx/5xx except `503` with `Retry-After`.
- **G5 Web hosting.** Every route answers 200 from the SPA; `/` carries `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Strict-Transport-Security: max-age=31536000`, `Permissions-Policy: camera=(), geolocation=()`; the bundle names its
  commit and pins the executor's delegation contract; `manifest.webmanifest` and its icons are served as their types.

---

## A. Screens — 101 routes

Per-route definitions of correct (what is on screen when loaded; the loading, empty and error states; what must not
show; what every control does; how the route is reached) are the rows of [docs/qa/SCREENS.md](qa/SCREENS.md), ids
S001–S101. A route passes on a surface only when every clause of its row holds there and G1–G4 hold.

<!-- SCREENS:BEGIN -->
| Id | Route | Auth | Web, signed out | Native, signed in | Web, signed in |
| --- | --- | --- | --- | --- | --- |
| S001 | `/welcome` · `/welcome` | No | Not run | Not run | UNTESTED (owner sign-in) |
| S002 | `/goals` · `/goals` | No | Not run | Not run | UNTESTED (owner sign-in) |
| S003 | `/wallet` · `/wallet` | No (this is sign-in) | Not run | Not run | UNTESTED (owner sign-in) |
| S004 | `/fund` · `/fund` | No (address needs a session) | Not run | Not run | UNTESTED (owner sign-in) |
| S005 | `/delegate` · `/delegate` | Yes (the user's Privy wallet signs) | Not run | Not run | UNTESTED (owner sign-in) |
| S006 | `/proposal` · `/proposal` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S007 | `/` · `/` (also `/?tab=futures`) | Yes (no wallet → redirect `/welcome`) | Not run | Not run | UNTESTED (owner sign-in) |
| S008 | `/markets` · `/markets` | No | Not run | Not run | UNTESTED (owner sign-in) |
| S009 | `/holdings` · `/holdings` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S010 | `/more` · `/more` | No | Not run | Not run | UNTESTED (owner sign-in) |
| S011 | `/bot` · `/bot` | No (drawer content needs a session) | Not run | Not run | UNTESTED (owner sign-in) |
| S012 | `/portfolio` · `/portfolio` | Yes (sheet) | Not run | Not run | UNTESTED (owner sign-in) |
| S013 | `/balance` · `/balance` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S014 | `/allocation` · `/allocation` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S015 | `/deposit` · `/deposit` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S016 | `/send` · `/send` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S017 | `/withdraw-everything` · `/withdraw-everything` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S018 | `/sell-everything` · `/sell-everything` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S019 | `/flatten` · `/flatten` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S020 | `/yield` · `/yield` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S021 | `/rates` · `/rates` | Partly (rate public; `YOURS` needs a session) | Not run | Not run | UNTESTED (owner sign-in) |
| S022 | `/limits` · `/limits` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S023 | `/spend` · `/spend` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S024 | `/history` · `/history` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S025 | `/activity` · `/activity` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S026 | `/pnl` · `/pnl` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S027 | `/disposals` · `/disposals` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S028 | `/export` · `/export` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S029 | `/asset/[symbol]` · `/asset/WETH` (also `/asset/BTC`, `/asset/NVDAc`) | No (position rows need a session) | Not run | Not run | UNTESTED (owner sign-in) |
| S030 | `/chart/[symbol]` · `/chart/BTC` | No | Not run | Not run | UNTESTED (owner sign-in) |
| S031 | `/order/[symbol]` · `/order/WETH?side=buy` | Yes (sheet) | Not run | Not run | UNTESTED (owner sign-in) |
| S032 | `/swap` · `/swap` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S033 | `/position/[id]` · `/position/<id from GET /positions>` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S034 | `/auto-close/[id]` · `/auto-close/<position id from GET /positions>` | Yes (sheet) | Not run | Not run | UNTESTED (owner sign-in) |
| S035 | `/limit-orders` · `/limit-orders` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S036 | `/route/[symbol]` · `/route/WETH` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S037 | `/crosschain` · `/crosschain` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S038 | `/perp/[symbol]` · `/perp/BTC` | No | Not run | Not run | UNTESTED (owner sign-in) |
| S039 | `/futures` · `/futures` | No | Not run | Not run | UNTESTED (owner sign-in) |
| S040 | `/funding` · `/funding` | No | Not run | Not run | UNTESTED (owner sign-in) |
| S041 | `/markets/[classId]` · `/markets/commodities` (`crypto` `stocks` `commodities` `indices` `preipo`) | No | Not run | Not run | UNTESTED (owner sign-in) |
| S042 | `/search` · `/search` | No | Not run | Not run | UNTESTED (owner sign-in) |
| S043 | `/watchlist` · `/watchlist` | No | Not run | Not run | UNTESTED (owner sign-in) |
| S044 | `/movers` · `/movers` | No | Not run | Not run | UNTESTED (owner sign-in) |
| S045 | `/stocks` · `/stocks` | No | Not run | Not run | UNTESTED (owner sign-in) |
| S046 | `/earnings` · `/earnings` | Yes (`/market/earnings` is not public) | Not run | Not run | UNTESTED (owner sign-in) |
| S047 | `/compare` · `/compare` | No | Not run | Not run | UNTESTED (owner sign-in) |
| S048 | `/agent/[id]` · `/agent/momentum-scout` or `/agent/<id from GET /agents>` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S049 | `/bot/roster` · `/bot/roster` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S050 | `/bot/[id]/intro` · `/bot/<id from GET /agents>/intro` | Yes (sheet) | Not run | Not run | UNTESTED (owner sign-in) |
| S051 | `/bot/[id]/settings` · `/bot/<id>/settings` | Yes (sheet) | Not run | Not run | UNTESTED (owner sign-in) |
| S052 | `/bot/[id]/backtest` · `/bot/momentum-scout/backtest` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S053 | `/bot/leaderboard` · `/bot/leaderboard` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S054 | `/roster-compare` · `/roster-compare` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S055 | `/risk` · `/risk` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S056 | `/voice` · `/voice` | No | Not run | Not run | UNTESTED (owner sign-in) |
| S057 | `/strategies` · `/strategies` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S058 | `/strategy/[id]` · `/strategy/<id from GET /strategies>` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S059 | `/strategy/dca` · `/strategy/dca` | Yes (sheet) | Not run | Not run | UNTESTED (owner sign-in) |
| S060 | `/strategy/yield` · `/strategy/yield` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S061 | `/strategy/grid` · `/strategy/grid` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S062 | `/backtest` · `/backtest` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S063 | `/schedule` · `/schedule` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S064 | `/runs` · `/runs` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S065 | `/runs/[id]` · `/runs/<id from GET /runs>` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S066 | `/proposals` · `/proposals` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S067 | `/safety` · `/safety` | Yes (a signed-out state exists) | Not run | Not run | UNTESTED (owner sign-in) |
| S068 | `/settings` · `/settings` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S069 | `/profile` · `/profile` | Yes (sheet) | Not run | Not run | UNTESTED (owner sign-in) |
| S070 | `/delegation` · `/delegation` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S071 | `/approvals` · `/approvals` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S072 | `/policy` · `/policy` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S073 | `/allowlist` · `/allowlist` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S074 | `/recovery` · `/recovery` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S075 | `/alerts` · `/alerts` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S076 | `/alerts/new` · `/alerts/new` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S077 | `/notifications` · `/notifications` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S078 | `/basename` · `/basename` | No | Not run | Not run | UNTESTED (owner sign-in) |
| S079 | `/legal/[doc]` · `/legal/terms` (`terms` `privacy` `risk`) | No | Not run | Not run | UNTESTED (owner sign-in) |
| S080 | `/verify` · `/verify` | No (sends the wallet when signed in) | Not run | Not run | UNTESTED (owner sign-in) |
| S081 | `/judge` · `/judge` | No | Not run | Not run | UNTESTED (owner sign-in) |
| S082 | `/sponsors` · `/sponsors` | Partly | Not run | Not run | UNTESTED (owner sign-in) |
| S083 | `/sources` · `/sources` | Partly | Not run | Not run | UNTESTED (owner sign-in) |
| S084 | `/venues` · `/venues` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S085 | `/tokens` · `/tokens` | No | Not run | Not run | UNTESTED (owner sign-in) |
| S086 | `/coverage` · `/coverage` | No | Not run | Not run | UNTESTED (owner sign-in) |
| S087 | `/crosscheck/[symbol]` · `/crosscheck/WETH` | No | Not run | Not run | UNTESTED (owner sign-in) |
| S088 | `/oracle/[symbol]` · `/oracle/NVDAc` | No | Not run | Not run | UNTESTED (owner sign-in) |
| S089 | `/audit/chain` · `/audit/chain` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S090 | `/audit/[seq]` · `/audit/<id of a row in GET /activity>` (the value `/audit/chain` links with) | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S091 | `/audit/anchor` · `/audit/anchor` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S092 | `/graph` · `/graph` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S093 | `/graph/spends` · `/graph/spends` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S094 | `/graph/decision` · `/graph/decision` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S095 | `/metrics` · `/metrics` | No | Not run | Not run | UNTESTED (owner sign-in) |
| S096 | `/system` · `/system` | No | Not run | Not run | UNTESTED (owner sign-in) |
| S097 | `/network` · `/network` | No | Not run | Not run | UNTESTED (owner sign-in) |
| S098 | `/explore` · `/explore` | No | Not run | Not run | UNTESTED (owner sign-in) |
| S099 | `/inbox` · `/inbox` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S100 | `/catchup` · `/catchup` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
| S101 | `/briefing` · `/briefing` | Yes | Not run | Not run | UNTESTED (owner sign-in) |
<!-- SCREENS:END -->

## B. Executor endpoints — 117 endpoints, 221 checks per executor

Per-check definitions of correct are the rows of [docs/qa/ENDPOINTS.md](qa/ENDPOINTS.md), ids E001–E221, run by
`tools/qa-full.mjs`. Status below is per executor from the last full run, then from the re-run after fixes.

<!-- ENDPOINTS:BEGIN -->
| Id | Method | Path | Auth | Fork (2026-09-14, 8c05266) | Sepolia (2026-09-14, 8c05266) | Re-run after fixes |
| --- | --- | --- | --- | --- | --- | --- |
| E001 | GET | `/activity` | Privy user | PASS | PASS | Not run |
| E002 | GET | `/activity` | Privy user | PASS | PASS | Not run |
| E003 | GET | `/activity/export` | Privy user | PASS | PASS | Not run |
| E004 | GET | `/activity/export?format=json` | Privy user | PASS | PASS | Not run |
| E005 | GET | `/activity/verify` | Privy user | PASS | PASS | Not run |
| E006 | GET | `/activity/verify` | Privy user | PASS | PASS | Not run |
| E007 | GET | `/activity/verify` | Privy user | PASS | PASS | Not run |
| E008 | GET | `/agent/due` | agent key | PASS | PASS | Not run |
| E009 | GET | `/agent/keys` | agent key | PASS | PASS | Not run |
| E010 | POST | `/agent/keys` | agent key | PASS | PASS | Not run |
| E011 | DELETE | `/agent/keys/:id` | agent key | PASS | PASS | Not run |
| E012 | POST | `/agent/positions/close` | agent key | PASS | PASS | Not run |
| E013 | POST | `/agent/strategies/:id/run` | agent key | PASS | PASS | Not run |
| E014 | POST | `/agent/tick` | agent key | PASS | PASS | Not run |
| E015 | GET | `/agent/whoami` | agent key | PASS | PASS | Not run |
| E016 | GET | `/agents` | Privy user | PASS | PASS | Not run |
| E017 | GET | `/agents` | Privy user | PASS | PASS | Not run |
| E018 | POST | `/agents` | Privy user | PASS | PASS | Not run |
| E019 | POST | `/agents` | Privy user | PASS | PASS | Not run |
| E020 | DELETE | `/agents/:id` | Privy user | PASS | PASS | Not run |
| E021 | DELETE | `/agents/:id` | Privy user | PASS | PASS | Not run |
| E022 | PATCH | `/agents/:id` | Privy user | PASS | PASS | Not run |
| E023 | PATCH | `/agents/:id` | Privy user | PASS | PASS | Not run |
| E024 | GET | `/agents/:id/backtest` | Privy user | PASS | PASS | Not run |
| E025 | GET | `/agents/:id/backtest` | Privy user | FAIL | FAIL | Not run |
| E026 | GET | `/agents/:id/backtest` | Privy user | FAIL | FAIL | Not run |
| E027 | GET | `/agents/:id/backtest` | Privy user | PASS | PASS | Not run |
| E028 | GET | `/agents/leaderboard` | Privy user | PASS | PASS | Not run |
| E029 | GET | `/agents/leaderboard` | Privy user | PASS | PASS | Not run |
| E030 | POST | `/agents/resume` | Privy user | PASS | PASS | Not run |
| E031 | POST | `/agents/resume` | Privy user | PASS | PASS | Not run |
| E032 | POST | `/agents/stop` | Privy user | PASS | PASS | Not run |
| E033 | POST | `/agents/stop` | Privy user | PASS | PASS | Not run |
| E034 | GET | `/agents/stopped` | Privy user | PASS | PASS | Not run |
| E035 | GET | `/agents/stopped` | Privy user | PASS | PASS | Not run |
| E036 | GET | `/alerts` | Privy user | PASS | PASS | Not run |
| E037 | GET | `/alerts` | Privy user | PASS | PASS | Not run |
| E038 | POST | `/alerts` | Privy user | PASS | PASS | Not run |
| E039 | POST | `/alerts` | Privy user | PASS | PASS | Not run |
| E040 | POST | `/alerts` | Privy user | PASS | PASS | Not run |
| E041 | DELETE | `/alerts/:id` | Privy user | PASS | PASS | Not run |
| E042 | DELETE | `/alerts/:id` | Privy user | PASS | PASS | Not run |
| E043 | POST | `/alerts/:id` | Privy user | PASS | PASS | Not run |
| E044 | POST | `/alerts/:id` | Privy user | PASS | PASS | Not run |
| E045 | POST | `/alerts/evaluate` | Privy user | PASS | PASS | Not run |
| E046 | GET | `/approvals` | Privy user | PASS | PASS | Not run |
| E047 | GET | `/approvals` | Privy user | PASS | PASS | Not run |
| E048 | GET | `/audit/anchor` | Privy user | PASS | PASS | Not run |
| E049 | GET | `/audit/anchor` | Privy user | PASS | PASS | Not run |
| E050 | POST | `/audit/anchor` | Privy user | PASS | PASS | Not run |
| E051 | GET | `/basename` | public | PASS | PASS | Not run |
| E052 | GET | `/basename` | public | FAIL | FAIL | Not run |
| E053 | POST | `/bot/say` | Privy user | PASS | PASS | Not run |
| E054 | POST | `/bot/say` | Privy user | PASS | PASS | Not run |
| E055 | GET | `/briefing` | Privy user | PASS | PASS | Not run |
| E056 | GET | `/catchup` | Privy user | PASS | PASS | Not run |
| E057 | GET | `/catchup` | Privy user | PASS | PASS | Not run |
| E058 | POST | `/catchup/seen` | Privy user | PASS | PASS | Not run |
| E059 | GET | `/crosschain/destinations` | Privy user | PASS | PASS | Not run |
| E060 | GET | `/crosschain/destinations` | Privy user | PASS | PASS | Not run |
| E061 | GET | `/crosschain/quote` | Privy user | PASS | PASS | Not run |
| E062 | GET | `/crosschain/quote` | Privy user | PASS | PASS | Not run |
| E063 | GET | `/crosschain/quote` | Privy user | PASS | PASS | Not run |
| E064 | GET | `/delegation` | Privy user | PASS | PASS | Not run |
| E065 | GET | `/delegation` | Privy user | PASS | PASS | Not run |
| E066 | GET | `/delegation/params` | Privy user | PASS | PASS | Not run |
| E067 | GET | `/delegation/params` | Privy user | PASS | PASS | Not run |
| E068 | POST | `/delegation/record` | Privy user | PASS | PASS | Not run |
| E069 | POST | `/delegation/record` | Privy user | PASS | PASS | Not run |
| E070 | POST | `/delegation/revoke` | Privy user | PASS | PASS | Not run |
| E071 | POST | `/delegation/revoke` | Privy user | PASS | PASS | Not run |
| E072 | POST | `/devices/register` | Privy user | PASS | PASS | Not run |
| E073 | POST | `/devices/register` | Privy user | PASS | PASS | Not run |
| E074 | GET | `/disposals` | Privy user | PASS | PASS | Not run |
| E075 | GET | `/disposals` | Privy user | PASS | PASS | Not run |
| E076 | GET | `/faucet` | Privy user | PASS | PASS | Not run |
| E077 | GET | `/faucet` | Privy user | PASS | PASS | Not run |
| E078 | POST | `/faucet` | Privy user | PASS | PASS | Not run |
| E079 | POST | `/faucet` | Privy user | PASS | PASS | Not run |
| E080 | GET | `/graph/activity` | Privy user | PASS | PASS | Not run |
| E081 | GET | `/graph/activity` | Privy user | PASS | PASS | Not run |
| E082 | GET | `/graph/decision` | Privy user | PASS | PASS | Not run |
| E083 | GET | `/graph/decision` | Privy user | FAIL | FAIL | Not run |
| E084 | GET | `/graph/decision` | Privy user | PASS | PASS | Not run |
| E085 | GET | `/graph/health` | Privy user | PASS | PASS | Not run |
| E086 | GET | `/graph/health` | Privy user | PASS | PASS | Not run |
| E087 | GET | `/health` | public | PASS | PASS | Not run |
| E088 | GET | `/history` | Privy user | PASS | PASS | Not run |
| E089 | GET | `/history` | Privy user | PASS | PASS | Not run |
| E090 | GET | `/history` | Privy user | PASS | PASS | Not run |
| E091 | GET | `/limit-orders` | Privy user | PASS | PASS | Not run |
| E092 | GET | `/limit-orders` | Privy user | PASS | PASS | Not run |
| E093 | POST | `/limit-orders` | operator | PASS | PASS | Not run |
| E094 | POST | `/limit-orders/:hash/fill` | Privy user | PASS | PASS | Not run |
| E095 | POST | `/limit-orders/:hash/fill` | Privy user | PASS | PASS | Not run |
| E096 | GET | `/limits` | Privy user | FAIL | PASS | Not run |
| E097 | GET | `/limits` | Privy user | PASS | PASS | Not run |
| E098 | POST | `/limits/check` | Privy user | PASS | PASS | Not run |
| E099 | POST | `/limits/check` | Privy user | PASS | PASS | Not run |
| E100 | GET | `/market/crosscheck` | public | PASS | PASS | Not run |
| E101 | GET | `/market/crosscheck` | public | FAIL | FAIL | Not run |
| E102 | GET | `/market/earnings` | Privy user | PASS | PASS | Not run |
| E103 | GET | `/market/earnings` | Privy user | FAIL | FAIL | Not run |
| E104 | GET | `/market/earnings` | Privy user | PASS | PASS | Not run |
| E105 | GET | `/market/futures` | public | PASS | PASS | Not run |
| E106 | GET | `/market/logos` | public | FAIL | PASS | Not run |
| E107 | GET | `/market/ohlc` | public | PASS | PASS | Not run |
| E108 | GET | `/market/ohlc` | public | FAIL | FAIL | Not run |
| E109 | GET | `/market/quotes` | public | PASS | PASS | Not run |
| E110 | GET | `/market/sparklines` | public | PASS | PASS | Not run |
| E111 | GET | `/market/stocks` | public | PASS | PASS | Not run |
| E112 | GET | `/market/stocks/history` | public | PASS | PASS | Not run |
| E113 | GET | `/market/stocks/history` | public | FAIL | FAIL | Not run |
| E114 | GET | `/market/symbols` | public | PASS | PASS | Not run |
| E115 | GET | `/market/tradable` | public | PASS | PASS | Not run |
| E116 | GET | `/market/watchable` | public | PASS | PASS | Not run |
| E117 | GET | `/metrics` | public | PASS | PASS | Not run |
| E118 | GET | `/notifications/prefs` | Privy user | PASS | PASS | Not run |
| E119 | GET | `/notifications/prefs` | Privy user | PASS | PASS | Not run |
| E120 | POST | `/notifications/prefs` | Privy user | PASS | PASS | Not run |
| E121 | POST | `/notifications/prefs` | Privy user | PASS | PASS | Not run |
| E122 | POST | `/notify/test` | Privy user | PASS | PASS | Not run |
| E123 | GET | `/ops/mirror` | operator | PASS | PASS | Not run |
| E124 | POST | `/ops/mirror` | operator | PASS | PASS | Not run |
| E125 | POST | `/orders` | Privy user | PASS | PASS | Not run |
| E126 | POST | `/orders` | Privy user | PASS | PASS | Not run |
| E127 | POST | `/panic/flatten` | Privy user | PASS | PASS | Not run |
| E128 | GET | `/panic/preview` | Privy user | PASS | PASS | Not run |
| E129 | GET | `/panic/preview` | Privy user | PASS | PASS | Not run |
| E130 | GET | `/perp/:symbol` | public | PASS | PASS | Not run |
| E131 | GET | `/perp/:symbol` | public | PASS | PASS | Not run |
| E132 | GET | `/perp/:symbol/candles` | public | PASS | PASS | Not run |
| E133 | GET | `/perp/:symbol/candles` | public | PASS | PASS | Not run |
| E134 | GET | `/pnl/disposals.csv` | Privy user | PASS | PASS | Not run |
| E135 | GET | `/pnl/disposals.csv` | Privy user | PASS | PASS | Not run |
| E136 | GET | `/pnl/realised` | Privy user | PASS | PASS | Not run |
| E137 | GET | `/pnl/realised` | Privy user | PASS | PASS | Not run |
| E138 | GET | `/portfolio/history` | Privy user | PASS | PASS | Not run |
| E139 | GET | `/portfolio/history` | Privy user | PASS | PASS | Not run |
| E140 | GET | `/portfolio/history` | Privy user | PASS | PASS | Not run |
| E141 | POST | `/portfolio/snapshot` | Privy user | PASS | PASS | Not run |
| E142 | POST | `/portfolio/snapshot` | Privy user | PASS | PASS | Not run |
| E143 | GET | `/positions` | Privy user | PASS | PASS | Not run |
| E144 | GET | `/positions` | Privy user | PASS | PASS | Not run |
| E145 | GET | `/positions/:id` | Privy user | PASS | PASS | Not run |
| E146 | GET | `/positions/:id` | Privy user | PASS | PASS | Not run |
| E147 | POST | `/positions/close` | Privy user | PASS | PASS | Not run |
| E148 | POST | `/positions/close` | Privy user | PASS | PASS | Not run |
| E149 | GET | `/price/:symbol` | Privy user | PASS | PASS | Not run |
| E150 | GET | `/price/:symbol` | Privy user | FAIL | FAIL | Not run |
| E151 | GET | `/price/:symbol` | Privy user | PASS | PASS | Not run |
| E152 | GET | `/privy/policy` | Privy user | PASS | PASS | Not run |
| E153 | GET | `/privy/policy` | Privy user | PASS | PASS | Not run |
| E154 | POST | `/privy/policy/prove` | operator | PASS | PASS | Not run |
| E155 | GET | `/proposals` | Privy user | PASS | PASS | Not run |
| E156 | GET | `/proposals` | Privy user | PASS | PASS | Not run |
| E157 | POST | `/proposals` | Privy user | PASS | PASS | Not run |
| E158 | POST | `/proposals` | Privy user | PASS | PASS | Not run |
| E159 | POST | `/proposals/:id/decide` | Privy user | PASS | PASS | Not run |
| E160 | POST | `/proposals/:id/decide` | Privy user | FAIL | FAIL | Not run |
| E161 | POST | `/proposals/:id/decide` | Privy user | PASS | PASS | Not run |
| E162 | GET | `/proposals/current` | Privy user | PASS | PASS | Not run |
| E163 | GET | `/proposals/current` | Privy user | PASS | PASS | Not run |
| E164 | POST | `/proposals/generate` | Privy user | PASS | PASS | Not run |
| E165 | GET | `/route/compare` | Privy user | PASS | PASS | Not run |
| E166 | GET | `/route/compare` | Privy user | FAIL | FAIL | Not run |
| E167 | GET | `/route/compare` | Privy user | PASS | PASS | Not run |
| E168 | GET | `/runs` | Privy user | PASS | PASS | Not run |
| E169 | GET | `/runs` | Privy user | FAIL | FAIL | Not run |
| E170 | GET | `/runs` | Privy user | PASS | PASS | Not run |
| E171 | GET | `/strategies` | Privy user | FAIL | FAIL | Not run |
| E172 | GET | `/strategies` | Privy user | PASS | PASS | Not run |
| E173 | POST | `/strategies` | Privy user | FAIL | FAIL | Not run |
| E174 | POST | `/strategies` | Privy user | PASS | PASS | Not run |
| E175 | POST | `/strategies` | Privy user | PASS | PASS | Not run |
| E176 | DELETE | `/strategies/:id` | Privy user | PASS | PASS | Not run |
| E177 | DELETE | `/strategies/:id` | Privy user | PASS | PASS | Not run |
| E178 | PATCH | `/strategies/:id` | Privy user | PASS | PASS | Not run |
| E179 | PATCH | `/strategies/:id` | Privy user | PASS | PASS | Not run |
| E180 | POST | `/strategies/:id/run` | Privy user | PASS | PASS | Not run |
| E181 | POST | `/strategies/:id/run` | Privy user | PASS | PASS | Not run |
| E182 | POST | `/strategies/backtest` | Privy user | PASS | PASS | Not run |
| E183 | POST | `/strategies/backtest` | Privy user | FAIL | FAIL | Not run |
| E184 | POST | `/strategies/backtest` | Privy user | PASS | PASS | Not run |
| E185 | POST | `/swap` | Privy user | PASS | PASS | Not run |
| E186 | POST | `/swap` | Privy user | PASS | PASS | Not run |
| E187 | GET | `/swap/quote` | Privy user | FAIL | PASS | Not run |
| E188 | GET | `/swap/quote` | Privy user | FAIL | FAIL | Not run |
| E189 | GET | `/swap/quote` | Privy user | PASS | PASS | Not run |
| E190 | GET | `/verify` | public | PASS | PASS | Not run |
| E191 | GET | `/verify` | public | PASS | PASS | Not run |
| E192 | GET | `/wallet` | Privy user | PASS | PASS | Not run |
| E193 | GET | `/wallet` | Privy user | PASS | PASS | Not run |
| E194 | GET | `/wallet/balance` | Privy user | PASS | PASS | Not run |
| E195 | GET | `/wallet/balance` | Privy user | PASS | PASS | Not run |
| E196 | POST | `/wallet/connect` | Privy user | PASS | PASS | Not run |
| E197 | POST | `/wallet/connect` | Privy user | PASS | PASS | Not run |
| E198 | POST | `/wallet/create` | Privy user | PASS | PASS | Not run |
| E199 | GET | `/wallet/funds` | Privy user | PASS | PASS | Not run |
| E200 | GET | `/wallet/funds` | Privy user | PASS | PASS | Not run |
| E201 | GET | `/wallet/tokens` | Privy user | PASS | PASS | Not run |
| E202 | GET | `/wallet/tokens` | Privy user | PASS | PASS | Not run |
| E203 | GET | `/withdrawal-addresses` | Privy user | PASS | PASS | Not run |
| E204 | GET | `/withdrawal-addresses` | Privy user | PASS | PASS | Not run |
| E205 | POST | `/withdrawal-addresses` | Privy user | PASS | PASS | Not run |
| E206 | POST | `/withdrawal-addresses` | Privy user | FAIL | FAIL | Not run |
| E207 | POST | `/withdrawal-addresses` | Privy user | PASS | PASS | Not run |
| E208 | POST | `/withdrawal-addresses/check` | Privy user | PASS | PASS | Not run |
| E209 | POST | `/withdrawal-addresses/check` | Privy user | PASS | PASS | Not run |
| E210 | POST | `/withdrawal-addresses/remove` | Privy user | PASS | PASS | Not run |
| E211 | POST | `/withdrawal-addresses/remove` | Privy user | PASS | PASS | Not run |
| E212 | POST | `/withdrawals/prepare-all` | Privy user | PASS | PASS | Not run |
| E213 | POST | `/withdrawals/prepare-all` | Privy user | PASS | PASS | Not run |
| E214 | POST | `/withdrawals/record` | Privy user | PASS | PASS | Not run |
| E215 | POST | `/withdrawals/record` | Privy user | PASS | PASS | Not run |
| E216 | GET | `/yield/position` | Privy user | PASS | PASS | Not run |
| E217 | GET | `/yield/position` | Privy user | PASS | PASS | Not run |
| E218 | GET | `/yield/supply` | public | PASS | PASS | Not run |
| E219 | POST | `/yield/withdraw-calldata` | Privy user | PASS | FAIL | Not run |
| E220 | POST | `/yield/withdraw-calldata` | Privy user | FAIL | FAIL | Not run |
| E221 | POST | `/yield/withdraw-calldata` | Privy user | PASS | PASS | Not run |
<!-- ENDPOINTS:END -->

## C. On-chain interactions

Contracts: `XorrDelegation` (fork `0xc32dd8aeed3035d46c7c82a351fc5522c9d463f4`, Sepolia `0x6c5528Fd8E74a047A85bAb413856A9239E73540e`),
`XorrAuditAnchor`, `XorrAquaBook`, `XorrSwapVMBook`, `TestUSDC`, `TestVenue`.

| Id | Interaction | Correct when | Surface | Status |
| --- | --- | --- | --- | --- |
| C00 | Contract test suites | `forge test` in contracts/: every unit suite (XorrDelegation, XorrAuditAnchor) and every fork suite (XorrAquaBook, XorrSwapVM, XorrStocks against a local fork of Base) passes | Foundry | PASS (2026-09-15: unit 39/39, fork 35/35) |
| C01 | Delegation contract deployed and pinned | `eth_getCode` at the executor's `/health.delegation` is non-empty on each chain; the web bundle's pinned address equals it; `/verify` row "XorrDelegation is deployed and has code" passes with the byte count and address | Chain, web bundle, Judge | PASS (2026-09-15: 5,207 bytes at 0xc32d…63f4 on the fork and 0x6c55…540e on Sepolia, each equal to its executor's `/health.delegation`; the bundle pin checked at every web deploy; Judge row passes on the simulator) |
| C02 | `grant()` signed by the owner | After the owner signs on the permission screen: `policyOf(owner)` returns the executor's delegate, the chosen daily cap and expiry, `revoked=false`; a `Granted` event in that transaction; `/delegation` and Safety show the same cap and expiry; the subgraph indexes the grant | Native, Chain | Not run |
| C03 | `spend()` inside the permission | A strategy run fills: a `Spent` event from the delegate to an allowed venue; `spentToday(owner)` rises by the run's size; the output token reaches the owner's wallet (balance read before and after); `/runs` shows `Filled` with that tx hash | Native, API, Chain | Not run |
| C04 | Over the daily cap | A run larger than `remainingToday(owner)` is refused: the revert is `DailyCapExceeded(requested, remaining)` or the executor refuses before sending; `/runs` shows `Refused` with the sentence naming the cap; no tokens move | API, Chain | Not run |
| C05 | Venue not allowed | A spend to a venue the owner did not allow reverts `VenueNotAllowed(venue)`; `/verify` row "The bot can only reach venues the user allowlisted" passes with a control address denied | Judge, Chain | Not run |
| C06 | After revoke or expiry | Spends revert `PolicyRevoked` / `PolicyExpired`; the scheduler marks runs refused with that reason; nothing moves | API, Chain | Not run |
| C07 | Not the delegate | A spend from any other address reverts `NotDelegate` | Chain (anvil) | Not run |
| C08 | `revoke()` by the owner, with no server | The owner's revoke lands and is confirmed from the chain alone: `policyOf(owner).revoked=true` after the receipt; a stale pinned address is passed over for the contract holding the live policy; a mined transaction that revoked nothing is not taken for a stop | Chain (anvil fork of the hosted fork, `tools/prove-stop-without-server.ts`) | PASS (2026-09-14, every check) |
| C09 | `closePosition()` after revoke | Reverts `PolicyRevoked`, so stop-losses and Sell everything cannot run after a stop — and Safety's footnote says exactly that (`Stops all trading, stop-losses too. Your funds stay in your wallet.`) | Chain, Native | Not run |
| C10 | `setVenue()` | Toggling one venue changes `isVenueAllowed(owner, venue)` with a `VenueAllowed` event and no re-grant | — | NOT BUILT in the app (FEATURES.md #56) |
| C11 | Audit anchor | `XorrAuditAnchor.latest(anchorer, owner)` returns a non-empty head and count; the head equals the executor trail's hash at that count; `/audit/anchor` shows that block; a count going backwards reverts `CountWentBackwards` | Chain, Native, Web | Not run |
| C12 | Aqua book fill | A run routed to Aqua fills through `XorrAquaBook.fillForDelegation` for the active owner only; the book's balances change by the fill | API, Chain | Not run |
| C13 | SwapVM program fill | A run routed to SwapVM fills through `XorrSwapVMBook.fillForDelegation`; `hashOf(order)` matches the recorded order | API, Chain | Not run |
| C14 | Test funds | Fork faucet: USDC arrives in the owner's wallet (balance before/after) with an Activity row; Sepolia: `TestUSDC.mint` to the owner; a second claim inside the window is refused with the time it opens again | Native, API | Not run |
| C15 | Token approval revoke | On Approvals, `Revoke` sends `approve(spender, 0)` signed by the owner; `allowance(owner, spender)` reads 0 after the receipt; the row disappears or reads `Limited` → gone | Native, Chain | Not run |
| C16 | User-signed transfer | Send to an allowlisted address: a transfer signed by the owner's wallet is mined; the recipient's balance rises by the amount; Activity records it; a non-allowlisted address is refused before signing | Native, Chain | Not run |

## D. External integrations

| Id | Integration | Correct when | Surface | Status |
| --- | --- | --- | --- | --- |
| I01 | Privy auth | Server verifies Privy access tokens: no token or a forged one → `401 {error:"unauthorized"}`; a real token → the account's data. Email code: a wrong code shows `That code is not right. Check it and try again.`, an expired one `That code has expired. Ask for a new one.` | API, Native | Not run |
| I02 | Privy embedded wallet | Sign-in yields the same wallet on every device; Profile shows `Wallet made with your email`; the wallet signs grant, revoke, approvals and transfers (C02, C08, C15, C16) | Native | Not run |
| I03 | Privy wallet policy | `/privy/policy` read shows the policy state on Safety (`Wallet policy On/Off`); a failed read shows `—`, never drops the row | Native, API | Not run |
| I04 | 1inch aggregator | `/swap/quote?in=USDC&out=WETH&amount=20&slippage=0.5` → 200 with a positive output and a route; a strategy fill through it records `1inch` as venue | API, Native | Not run |
| I05 | 1inch Aqua and SwapVM | Books open on the fork (C12, C13); `/route/compare` names every venue with an amount or a reason | API | Not run |
| I06 | 1inch limit orders | `/limit-orders` lists orders with take amounts or `No limit orders`; publishing is operator-only | API, Native | Not run |
| I07 | 1inch cross-chain quotes | `/crosschain` returns a quote or a named refusal (`quoter_refused`); the screen says `Quotes only` | API, Native | Not run |
| I08 | 1inch token list and logos | `/tokens` lists tradable tokens with addresses; `/market/logos` returns https URLs or null per symbol | API, Native | Not run |
| I09 | CoinGecko prices | `/market/quotes` prices BTC and ETH within 2% of CoinGecko's own simple-price read at the same minute; history and OHLC answer for 1H/4H/1D | API, Native, Web | Not run |
| I10 | The Graph subgraphs | Grants, spends and revokes for the owner appear in the subgraph; `/graph/spends` matches `/runs` fills; `/graph/decision` states whether the index is fresh enough to use | API, Native | Not run |
| I11 | Base RPC | Sepolia: `/health` reports `base-sepolia` and the block advances between two reads seconds apart. Fork: `/health` reports `base-fork`, the node answers chain id 8453 with the deployed contracts' code, and the block advances when a transaction lands (the fork is an anvil node that mines per transaction, so an idle fork's block standing still is correct — the first draft of this row said "a minute apart", which is wrong for anvil); Judge row "The app is talking to a real chain" passes | API, Chain, Judge | Sepolia PASS (2026-09-15: 46819272 → 46819275 in 6 s). Fork: chain and code PASS; block-on-transaction pending F04 |
| I12 | Hyperliquid funding | `/market/funding` returns rates stamped on the venue's clock; `/funding` renders them | API, Native | Not run |
| I13 | SEC EDGAR | `/market/earnings?symbol=NVDAc` returns filings with dates and links; a non-equity symbol is refused by name | API, Native | Not run |
| I14 | News feeds | Headlines on Briefing link to their sources | API, Native | Not run |
| I15 | Language model (OpenRouter) | `/bot/say` and Briefing takes answer | — | UNTESTED — each call spends paid model credits; exercised through refusals only |
| I16 | Expo push | A registered device receives a push for a fill | — | UNTESTED — the build has no EAS project id, so Expo issues no push token; needs a real device and an EAS project |
| I17 | Basenames | `/basename?address=` resolves a name or answers null; a bad address is a named 400 | API, Native | Not run |
| I18 | Persistence | A strategy created in the app survives an executor restart and a reload; the audit trail keeps growing and re-hashes (`/audit/chain`) | API, Native | Not run |
| I19 | Vercel hosting | G5 holds on the live deployment | Web | PASS at the HTTP level (2026-09-15, build 2c33e43: all 101 routes answer 200 with the app's bundle; the five headers present; manifest `application/manifest+json`, three icons `image/png`). Rendering per route is section A |
| I20 | Railway hosting | Each executor's `/health` is `ok` and its `version` equals the commit deployed; Settings shows one commit when the server code matches | API, Web | Not run |

## E. Flows

Each flow runs end to end on the named surface, then its edge cases.

| Id | Flow | Correct when | Edge cases and what correct means for each | Surface | Status |
| --- | --- | --- | --- | --- | --- |
| F01 | Sign in, new or returning | Welcome → Get started → goals → email → code → the wallet appears → Fund → permission → Home with a real balance; `POST /wallet/connect` 200 | Bad email: `That email does not look right…`; wrong code and expired code as I01; executor 5xx while registering: `We could not reach xorr just now. Your wallet is fine. Try again in a moment.` with `Try again`; a timeout says it may still be going through | Native (returning), Web | UNTESTED for a fresh sign-in — needs an email code typed by the owner |
| F02 | Session survives a relaunch | Kill and relaunch: Home, same wallet, no onboarding flash | Offline relaunch: errors are failures (G2), not an empty account | Native | Not run |
| F03 | Sign out | Settings → Sign out → confirm: `/welcome`; the device forgets the person (wallet, recovery "Done", stop switch, onboarding answers) and keeps device preferences | Next account on the device sees no trace of the last | Unit (`src/state/store.test.ts`); Native | UNTESTED on device — signing out ends the only signed-in session this run can hold |
| F04 | Fund | Deposit shows the wallet's full address and a real balance; the faucet claim lands (C14); the balance rises by the claim | Claim again inside the window: refused with when it opens; failed balance read: `—` | Native, API | Not run |
| F05 | Grant the permission | Permission screen → cap and term → Sign → approvals then grant signed → Safety `LIVE`, `Trading is live`, the cap and expiry as chosen (C02) | Grant pointed at a contract the build does not pin: refused before signing; interrupted before the signature: nothing changed on chain and Safety still reads the chain's state | Native, Chain | Not run |
| F06 | Stop and resume | Safety → Stop all trading → signed revoke → `STOPPED`, `Trading is stopped`, `Nothing trades until you resume.`; runs refuse with `PolicyRevoked`; Resume trading → re-grant from the chain's last plan → `LIVE` | Executor unreachable: the stop still offered from the chain and confirmed from the chain (C08; UI part is FEATURES.md #1); Face ID not enrolled: no prompt, as designed | Native, Chain | Not run |
| F07 | Recurring buy | Strategy → recurring buy → token, amount, cadence → start → listed live with its next runs → Run now fills (C03) → Runs `Filled` with tx → Activity row | Amount over the cap: refused with the cap; token outside the allowed set: not offered; run fails at the venue: `Failed` with the venue's sentence | Native, API | Not run |
| F08 | Order, buy and sell | Order ticket → amount → units from the live price → Place → fill → holding rises; Sell → holding falls | Sell more than held: refused before sending; price read failed: units show `—`; timeout: says it may still be going through | Native | Not run |
| F09 | Swap | Swap USDC → WETH → quote → review → swap → balances change by the quote within slippage | Over balance: button disabled with the balance; quote refused: the venue's sentence; failed price read: `—` | Native | Not run |
| F10 | Sell everything to cash | Flatten → preview lists each position and what it would sell for → confirm → positions closed, cash up | After a stop: says it cannot run and why (C09) | Native | Not run |
| F11 | Withdraw and send | Allowlist an address → Send an amount → signed transfer mined (C16) → Activity; Withdraw everything walks sell then send | Address not 0x + 40 hex: refused; not allowlisted: refused before signing; over balance: disabled | Native, Chain | Not run |
| F12 | Alerts | New alert on a symbol and level → listed on Alerts; when crossed, an Inbox row | Level not a number: refused; delete: gone after reload | Native, API | Not run |
| F13 | Proposals | A proposal shows entry, stop, target and a live expiry; Approve fills; Skip declines; untouched it expires | Another account's proposal id: 404 | Native, API | Not run |
| F14 | Agents | Roster → an agent → Get started hires it → Home shows it hired; its backtest runs on real past prices; leaderboard ranks by real P&L | Backtest with a bad lookback: named refusal | Native, API | Not run |
| F15 | Proof | Check it yourself (Judge) and Verify run every claim live with observed values (20 pass, 1 skip with its reason on the fork); Audit chain re-hashes the trail; Anchor shows the head on chain at a block; Export produces the trail | Signed out: Judge and Verify still run; an address typed into Judge reruns for that address | Web (signed out), Native | Not run |
| F16 | Recovery | Recovery shows the account email; `I can open this email` marks Recovery `Done` on Safety and Settings | Web: Export private key opens Privy's window | Native; Web | Web export UNTESTED — needs the owner signed in |
| F17 | Approvals | Approvals lists each token allowance to the delegation; Revoke zeroes it (C15) | Revoke declined in the wallet: nothing changes, the row stays | Native, Chain | Not run |
| F18 | Markets and assets | Markets lists classes with live prices or quiet dashes; Asset shows name, price and a chart for real ranges; Chart pills 1H 4H 1D draw their own candles | Symbol with no feed: `No chart yet.`; unknown route: the app's own 404 `There is nothing here` | Web, Native | Not run |
| F19 | Portfolio | Total balance equals wallet holdings priced live; the graph draws recorded snapshots for its ranges; positions and profit shown | A zero snapshot never spikes the line | Native | Not run |
| F20 | Settings and version | Settings rows open their screens; Version shows the web build's commit (one commit when the server code matches) | Executor unreachable: `Development build`/commit only, no warning | Web, Native | Not run |
| F21 | Limit orders and cross-chain | Limit orders lists real orders or `No limit orders`; cross-chain returns a quote or a named refusal, marked quotes only | — | Native, API | Not run |
| F22 | Voice | Voice screen opens and describes itself; speaking needs a device microphone | — | Native | Not run |

## Execution log

Runs are appended here with date, commit, surface and result counts.

| When | Build | Surface | What ran | Result |
| --- | --- | --- | --- | --- |
| 2026-09-15 | contracts at 00c41ef | Foundry | `forge test` unit and fork suites | 74/74 pass |
| 2026-09-15 | executors 8c05266 | Chain | C01 code and pins; I11 blocks | PASS (fork block rule corrected, see I11) |
| 2026-09-15 | web 2c33e43 | HTTP | I19: 101 routes, headers, manifest, icons | PASS |
| 2026-09-15 | executor-fork 8c05266 | API | `tools/qa-full.mjs`, 221 checks, before this run's server fixes | 199 pass, 22 fail. Newly failing against the 2026-09-14 run: E082 `/graph/decision`, E128 `/panic/preview`, E194 `/wallet/balance` — no response within 60 s (the app waits 45 s). Newly passing: E096, E106, E219 |
| 2026-09-15 | native, Metro main tree at b0ae828 | Native | Every route in `tools/shoot.mjs` (106) opened by deep link on the signed-in simulator, Metro's device log read after each | 106 opened; no error, TypeError or unresolved module logged for any route. Screens reviewed after the merged build, below |
| 2026-09-15 | web 00c41ef | Chrome | — | Claude in Chrome not connected after the machine restarted; signed-out web items run in the app's built-in Chromium (console and network read the same way) until it reconnects |

---

## Earlier plan, kept as executed

The plan this file held before 2026-09-14 (commit 534463b), unchanged, headings demoted one level.

### Test plan

Written before execution. Every item states the SPECIFIC expected result. A pass means the real
result matches this text, with no console error and no failed request on that screen.

Target: the deployed app, `https://web-production-3e214.up.railway.app` (Base Sepolia), against the
public executor `executor-production-1659.up.railway.app`. Where an item can only be true on the
mainnet fork, that is stated and the fork deployment is used instead.

Signed in as a real Privy account with a real embedded wallet.

---

#### A · Infrastructure and chain (7)

| # | Item | Correct means |
|---|---|---|
| A1 | Hosted app reachable | `GET /` returns 200 and the app boots to `/welcome` when signed out |
| A2 | Executor (Sepolia) healthy | `/health` → `status: up`, `chain: base-sepolia`, postgres dependency `up` |
| A3 | Executor (fork) healthy | `/health` → `status: up`, `chain: base-fork`, postgres `up` |
| A4 | `XorrDelegation` deployed on Base Sepolia | `eth_getCode` returns >7000 bytes at `0xb14CF3D0…0a4e` |
| A5 | Postgres persisted, not in-memory | Audit chain re-verifies N of N rows; a row written in one session is present after an executor restart |
| A6 | Delegation subgraph synced | `_meta.hasIndexingErrors` false, block within ~10 of the Sepolia head, ≥1 policy indexed |
| A7 | Dev screens sealed in production | `/_dev/ui`, `/_dev/ui-edge`, `/_dev/fidelity`, `/_dev/boom` each redirect to `/` — no gallery, no throw button |

#### B · Core user flow, end to end (8)

| # | Item | Correct means |
|---|---|---|
| B1 | Sign in with email OTP | Privy accepts the code; all four onboarding steps turn green (Signed in / Wallet created / Network ready / Ready to fund) |
| B2 | Embedded wallet is the one used | The address shown on `/profile` is the Privy **embedded** wallet, not an injected browser extension |
| B3 | New wallet receives gas | A wallet the executor has never seen is sent 0.002 test ETH, and the trail records it |
| B4 | Grant the permission | Four Privy dialogs (3 approvals + `grant`), each confirming on Base Sepolia; no browser-extension dialog appears |
| B5 | Permission verified on chain | `/verify?owner=…` → `policy` PASS with the chosen cap, `revoked=false`, `delegate matches`; `venues` PASS "1 of 1 granted; a control address is correctly denied" |
| B6 | App reflects the grant | `/safety` shows LIVE, `/delegation` shows the cap and the embedded wallet as Owner, `/limits` shows that cap as remaining — all three agreeing |
| B7 | Kill switch revokes on chain | Pressing "Stop all agents" signs a `revoke`; `/verify` then reports `revoked=true` and `$0 left today` |
| B8 | App reflects the revoke | `/safety` shows STOPPED with the CTA changed to "Resume agents"; `/limits` shows `$0.00 cap` — both matching the chain |

#### C · Strategy lifecycle (5)

| # | Item | Correct means |
|---|---|---|
| C1 | Create a recurring buy | Strategy persists; `/strategies` count increments; `/schedule` lists it with the correct next-run date |
| C2 | Creation attributed correctly | Activity row reads "Created …" attributed to `xorr`, NOT to a persona that did not run it |
| C3 | Run now, on a chain that cannot fill | A readable sentence — "This network cannot settle trades. Prices are real; filling needs Base or a Base fork." No status code, no JSON, no truncation |
| C4 | Idempotence | Running the same strategy again in the same period returns "Already ran this period." and creates no second run |
| C5 | Real fills exist somewhere | The fork deployment reports ≥1 filled run through 1inch with a transaction hash |

#### D · Money-moving guards (6)

| # | Item | Correct means |
|---|---|---|
| D1 | Swap over balance | Amount above the held balance disables "Review swap" and states the real holding |
| D2 | Swap balance while unknown | A failed positions read shows an em dash and "tap to retry", never a confident `0.0000` |
| D3 | Order over settled cash | "That is more than the $0.00 you have settled." and the button does not submit |
| D4 | Send with empty allowlist | Blocked, with "Add a destination to your allowlist first." |
| D5 | Flatten with nothing held | "Sell everything" disabled, "Nothing to sell." stated |
| D6 | Unsettleable instrument | `/order/NVDAc` states the instrument cannot be settled on this chain and offers no order |

#### E · Data honesty (6)

| # | Item | Correct means |
|---|---|---|
| E1 | Prices are real | Crypto prices come from CoinGecko and move between loads; equity prices come from a live 1inch route |
| E2 | Simulated markets labelled | Every instrument with `feed: simulated` carries a SIMULATED tag on BOTH `/markets/:class` and `/movers` |
| E3 | Aave rate real, and gated | The APY is read from the pool; on a chain without Aave the sweep is disabled and says why |
| E4 | Cross-check | `/crosscheck/WETH` shows two independent sources and their spread |
| E5 | Index coverage stated | When the subgraph indexes a different contract than the build trades, `/history` and `/graph` say so instead of "nothing has settled" |
| E6 | Chain named correctly | `/fund` and `/tokens` name the chain this build actually settles on, with its addresses |

#### F · Proof surfaces (5)

| # | Item | Correct means |
|---|---|---|
| F1 | `/verify` public | Answers with no account; ≥13 checks pass, 0 fail |
| F2 | `/judge` in-app | Renders the same checks live with counts, and shows a skip as a skip rather than a pass |
| F3 | Audit hash chain | `/audit/chain` reports "Unbroken" and N of N rows re-hash |
| F4 | Export | Produces a file with a stated row count from a real `200` on `/activity/export` |
| F5 | Approvals read from chain | `/approvals` lists real per-token allowances and flags an unlimited one |

#### G · Edge cases and interruptions (8)

| # | Item | Correct means |
|---|---|---|
| G1 | Unknown market class | Names the classes that exist; no blank screen |
| G2 | Unknown legal document | Says the document does not exist; does NOT serve a different one |
| G3 | Unknown agent | Says the agent is not on the roster; no "Get Started" for a nonexistent agent |
| G4 | Invalid ids | `/position/999`, `/runs/999`, `/audit/999`, `/agent/999`, `/strategy/999`, `/auto-close/999` each give a specific not-found sentence |
| G5 | Permanent API refusal | `/oracle/WETH` shows the server's sentence with NO retry button and no JSON |
| G6 | Refresh mid-load | Interrupting a loading screen three times recovers with correct data and no console error |
| G7 | Double submit | Submitting twice rapidly creates exactly one record |
| G8 | Small screen | 375px wide: no horizontal overflow, guards and CTAs still legible |

#### H · Whole-surface sweep (2)

| # | Item | Correct means |
|---|---|---|
| H1 | All 93 product routes render | Every non-`_dev` route renders its real content or an honest empty state — no crash, no error boundary |
| H2 | Zero console/network errors | No console error on any screen; every executor request 2xx/204 |

#### I · Untestable here — stated, not marked pass

| # | Item | Why |
|---|---|---|
| I1 | Base mainnet settlement | Contract not deployed on mainnet; deploying spends real money |
| I2 | 1inch fills on the hosted app | 1inch has no Sepolia liquidity — real fills verified on the fork instead (C5) |
| I3 | AI chat replies from a model | No LLM key exists in the repo |
| I4 | Aqua venue subgraph | Built and pinned, but `graph deploy` needs a Studio slug that does not exist |
| I5 | SwapVM real fill | No maker has shipped a SwapVM program; contract covered by 10 fork tests |

---

### Results

Executed against the deployed app on 2026-09-09. Two items failed, were fixed at the root, and
re-verified from the start; the whole plan was then re-run.

| Section | Result |
|---|---|
| A · Infrastructure and chain | **7/7 PASS** |
| B · Core user flow | **8/8 PASS** |
| C · Strategy lifecycle | **5/5 PASS** (C2 failed first — see below) |
| D · Money-moving guards | **6/6 PASS** |
| E · Data honesty | **6/6 PASS** |
| F · Proof surfaces | **5/5 PASS** (F2 failed first — see below) |
| G · Edge cases | **7/8 PASS**, G7 not reproducible — see below |
| H · Whole-surface sweep | **2/2 PASS** |

#### The two failures, and what fixed them

**C2 — strategy creation attributed to a persona that did not run it.** The activity row read
"Created $50 of WETH, monthly · Yield Keeper". The code fix (`agentName` defaulting to `xorr`
instead of `'Yield Keeper'`) was already committed, but the executor deployment carrying it had
been stuck "Building" for 34 minutes, so the running service still had the old code. Redeployed;
a freshly created strategy now reads "Created $50 of CBBTC, weekly · xorr". The older row keeps
its original attribution, which is correct — the trail is append-only.

**F2 — /judge invented a reason for a skipped check.** The header said "1 skipped — those need a
wallet address, and none was given" while signed in with a wallet that nineteen of the twenty
checks had just used. The single skip was the tokenized-equities check, which skips because those
tokens do not function on Sepolia and says so on its own row. Wallet-gated skips identify
themselves (`No wallet on this request.`), so that sentence is now used only when it is true of
every skip; otherwise the summary points at the rows. Now reads "1 skipped — each says why on its
own row. Skipped is not passed."

#### G7 — double submit: guard verified, gesture not reproducible

Chrome's click injection stopped landing partway through this run — single coordinate clicks,
`ref` clicks, `.click()` and synthetic pointer sequences all produced no effect, on two tabs, on a
button that had accepted clicks earlier in the same session. Six attempts created zero records,
which measures the tooling and not the guard.

The guard itself was untested, so it is now: `createPressGuard` was extracted from
`useGuardedPress` — behaviour unchanged, including the 800ms hold — with 7 tests covering the case
that matters, two `take()` calls in the same tick where the second must be refused. Marked
**not verified end-to-end** rather than PASS, because the browser gesture is what the item asked for.

#### Untestable here (I1–I5) — stated, not marked pass

Unchanged from the plan: Base mainnet settlement (mainnet deploy spends real money), 1inch fills on
Sepolia (no liquidity — verified on the fork instead), the AI chat's model (no LLM key exists), the
Aqua venue subgraph (needs a Studio slug), and a SwapVM fill (no maker has shipped a program).
