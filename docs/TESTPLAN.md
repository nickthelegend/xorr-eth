# Test plan

Written before execution. Every item states the SPECIFIC expected result. A pass means the real
result matches this text, with no console error and no failed request on that screen.

Target: the deployed app, `https://web-production-3e214.up.railway.app` (Base Sepolia), against the
public executor `executor-production-1659.up.railway.app`. Where an item can only be true on the
mainnet fork, that is stated and the fork deployment is used instead.

Signed in as a real Privy account with a real embedded wallet.

---

## A · Infrastructure and chain (7)

| # | Item | Correct means |
|---|---|---|
| A1 | Hosted app reachable | `GET /` returns 200 and the app boots to `/welcome` when signed out |
| A2 | Executor (Sepolia) healthy | `/health` → `status: up`, `chain: base-sepolia`, postgres dependency `up` |
| A3 | Executor (fork) healthy | `/health` → `status: up`, `chain: base-fork`, postgres `up` |
| A4 | `XorrDelegation` deployed on Base Sepolia | `eth_getCode` returns >7000 bytes at `0xb14CF3D0…0a4e` |
| A5 | Postgres persisted, not in-memory | Audit chain re-verifies N of N rows; a row written in one session is present after an executor restart |
| A6 | Delegation subgraph synced | `_meta.hasIndexingErrors` false, block within ~10 of the Sepolia head, ≥1 policy indexed |
| A7 | Dev screens sealed in production | `/_dev/ui`, `/_dev/ui-edge`, `/_dev/fidelity`, `/_dev/boom` each redirect to `/` — no gallery, no throw button |

## B · Core user flow, end to end (8)

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

## C · Strategy lifecycle (5)

| # | Item | Correct means |
|---|---|---|
| C1 | Create a recurring buy | Strategy persists; `/strategies` count increments; `/schedule` lists it with the correct next-run date |
| C2 | Creation attributed correctly | Activity row reads "Created …" attributed to `xorr`, NOT to a persona that did not run it |
| C3 | Run now, on a chain that cannot fill | A readable sentence — "This network cannot settle trades. Prices are real; filling needs Base or a Base fork." No status code, no JSON, no truncation |
| C4 | Idempotence | Running the same strategy again in the same period returns "Already ran this period." and creates no second run |
| C5 | Real fills exist somewhere | The fork deployment reports ≥1 filled run through 1inch with a transaction hash |

## D · Money-moving guards (6)

| # | Item | Correct means |
|---|---|---|
| D1 | Swap over balance | Amount above the held balance disables "Review swap" and states the real holding |
| D2 | Swap balance while unknown | A failed positions read shows an em dash and "tap to retry", never a confident `0.0000` |
| D3 | Order over settled cash | "That is more than the $0.00 you have settled." and the button does not submit |
| D4 | Send with empty allowlist | Blocked, with "Add a destination to your allowlist first." |
| D5 | Flatten with nothing held | "Sell everything" disabled, "Nothing to sell." stated |
| D6 | Unsettleable instrument | `/order/NVDAc` states the instrument cannot be settled on this chain and offers no order |

## E · Data honesty (6)

| # | Item | Correct means |
|---|---|---|
| E1 | Prices are real | Crypto prices come from CoinGecko and move between loads; equity prices come from a live 1inch route |
| E2 | Simulated markets labelled | Every instrument with `feed: simulated` carries a SIMULATED tag on BOTH `/markets/:class` and `/movers` |
| E3 | Aave rate real, and gated | The APY is read from the pool; on a chain without Aave the sweep is disabled and says why |
| E4 | Cross-check | `/crosscheck/WETH` shows two independent sources and their spread |
| E5 | Index coverage stated | When the subgraph indexes a different contract than the build trades, `/history` and `/graph` say so instead of "nothing has settled" |
| E6 | Chain named correctly | `/fund` and `/tokens` name the chain this build actually settles on, with its addresses |

## F · Proof surfaces (5)

| # | Item | Correct means |
|---|---|---|
| F1 | `/verify` public | Answers with no account; ≥13 checks pass, 0 fail |
| F2 | `/judge` in-app | Renders the same checks live with counts, and shows a skip as a skip rather than a pass |
| F3 | Audit hash chain | `/audit/chain` reports "Unbroken" and N of N rows re-hash |
| F4 | Export | Produces a file with a stated row count from a real `200` on `/activity/export` |
| F5 | Approvals read from chain | `/approvals` lists real per-token allowances and flags an unlimited one |

## G · Edge cases and interruptions (8)

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

## H · Whole-surface sweep (2)

| # | Item | Correct means |
|---|---|---|
| H1 | All 93 product routes render | Every non-`_dev` route renders its real content or an honest empty state — no crash, no error boundary |
| H2 | Zero console/network errors | No console error on any screen; every executor request 2xx/204 |

## I · Untestable here — stated, not marked pass

| # | Item | Why |
|---|---|---|
| I1 | Base mainnet settlement | Contract not deployed on mainnet; deploying spends real money |
| I2 | 1inch fills on the hosted app | 1inch has no Sepolia liquidity — real fills verified on the fork instead (C5) |
| I3 | AI chat replies from a model | No LLM key exists in the repo |
| I4 | Aqua venue subgraph | Built and pinned, but `graph deploy` needs a Studio slug that does not exist |
| I5 | SwapVM real fill | No maker has shipped a SwapVM program; contract covered by 10 fork tests |
