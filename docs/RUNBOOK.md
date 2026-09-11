# Incident runbook — PLAN.md 14.8

The bot spends real money without a human present. This is what to do when it misbehaves.

## 0. The first move is always the same

**Stop the bot before you diagnose it.** Diagnosis takes minutes; a misbehaving strategy takes
seconds.

```bash
# Per user (their own kill switch, on chain):
curl -XPOST $API/delegation/revoke -d '{}'

# Global, independent of every per-user delegation:
railway variables set SCHEDULER=off && railway redeploy
```

The global kill and the per-user kill are deliberately separate. A bug in one user's strategy
should not require revoking everyone; a bug in the executor should not require asking every user
to press a button.

## 1. "The bot bought twice"

Almost certainly it did not — check before you believe it.

```sql
SELECT period_key, count(*) FROM strategy_runs GROUP BY 1 HAVING count(*) > 1;
```

`period_key` is `UNIQUE`, so this query returning rows means the constraint was dropped, not that
the executor raced. If it returns nothing, the second "buy" the user saw is a duplicate
NOTIFICATION or a duplicate audit row — look there instead.

## 2. "A strategy is stuck"

```sql
SELECT * FROM strategy_runs WHERE status='pending' AND started_at < now() - interval '10 minutes';
```

A pending run means the period was claimed and the transaction never resolved. Do NOT delete the
row to "let it retry" — that is exactly how a double-spend happens. Instead:

1. Look up the intended transfer on chain by the strategy's owner token account.
2. If it landed, mark the run `filled` with the real signature.
3. If it did not, mark it `failed`. The next tick claims the next period, not this one.

## 3. "The audit trail does not verify"

```bash
curl $API/activity/verify
```

`ok: false` with a `brokenAtSeq` means a row was altered or removed. The table has an append-only
trigger, so this should be impossible without superuser access. Treat it as a security incident,
not a data-quality one: preserve the database, take a dump, and investigate access.

## 4. "The bot said something wrong"

Check whether it was a NUMBER or a SENTENCE.

- A wrong **number** is a serious bug: every figure is rendered by `src/format` from a stored
  record, so a wrong number means a wrong record. Trace it via the run's signature.
- A wrong **sentence** is a model artifact. It cannot contain a number (`validateVoice` rejects
  those), so the blast radius is tone. Lower the tone dial or set `XORR_MODEL` to a stronger model.

## 5. "Someone's funds moved unexpectedly"

The delegate key CANNOT withdraw — its only power is a capped transfer from one token account
(see `docs/SECURITY.md` §1). So an unexpected movement means either:

1. The user's own key was used elsewhere. Check the transaction's signer.
2. The delegate key was stolen AND an approval was live. Revoke every delegation immediately:

```sql
SELECT wallet_id FROM delegations WHERE revoked = false;
```

then rotate the delegate keypair and re-approve nothing until the cause is found.

## 6. Health checks

```bash
curl $API/health                 # db + cluster
curl $API/limits                 # cap, spent today, remaining
curl $API/delegation             # includes onChainRemainingUsd, read from the chain
```

`onChainRemainingUsd` disagreeing with `dailyCapUsd − spentTodayUsd` means our books and the chain
have diverged. **The chain is right.** Reconcile our records to it, never the other way round.

## 7. What NOT to do

- Do not "just restart the executor" to clear a stuck run. Restarting is safe (the period claim
  survives), but it does not resolve the run, and it hides the evidence in the logs.
- Do not edit `audit_log`. The trigger will refuse, and working around it destroys the artifact
  the trail exists to be.
- Do not raise a user's cap to unblock them. The block is the feature.
- Do not delete the Railway project to take the frontend down. The frontend is on Vercel; the
  Railway project is the backend, and its variables are the only copy of the delegate key, the
  Privy authorization key and the operator token. A project scheduled for deletion stops every
  deployment at once and locks those variables, and deleting it for good loses them. Remove a single
  service instead. (It happened on 2026-09-11 — see section 9.)

## 8. The Base mainnet fork ages, and has to be re-forked

`base-fork` is anvil pinned at the mainnet block it started from. It does not follow mainnet, but
**1inch quotes against live mainnet** — so the longer the fork runs, the further the real pools
drift from its copy of them, until the router's `minReturn` no longer holds and every fill reverts.

It reports itself correctly rather than silently filling badly:

```
The price moved more than your slippage limit while this was in flight. Nothing was placed.
```

Measured: at **~8,700 blocks behind** (about five hours of real trading) every swap failed this
way. Under an hour it is fine.

Re-fork when you see that error on trades that should route:

```bash
# 1. Restart anvil so it forks at the current mainnet block.
#    On Railway: set any variable on the `base-fork` service — a redeploy re-forks.

# 2. Redeploy OUR contracts onto it and fund a wallet. A fresh anvil has none of them.
FORK_RPC=<fork url> npm --prefix server run setup:fork -- <walletToFund>

# 3. Point the executor at the new addresses (they change every time).
#    DELEGATION_ADDRESS, AQUA_BOOK_ADDRESS, SWAPVM_BOOK_ADDRESS

# 4. Prove it end to end.
npx tsx server/src/live-agents.ts     # 20 checks: grant, fill, close, scopes, cap, revoke
```

The database survives — agent keys, strategies and the audit trail are keyed by user, not by
contract address. Only the on-chain state is new, so a wallet has to be re-granted and re-funded,
which `setup:fork` and `live-agents.ts` do between them.

## Rebuilding the fork

The anvil service forks Base at whatever the head is when its container starts, and never moves
after that. Live Base does. So the gap grows by roughly a block every two seconds, and it matters
because **1inch quotes against live state while execution happens against the fork's** — a swap
built from a live quote eventually cannot be satisfied by the frozen pools, and the aggregator
reverts `ReturnAmountIsNotEnough`.

Measured before the last rebuild: 13,110 blocks behind, about 7.3 hours, and every aggregator-routed
DCA failing on slippage. Aqua fills were unaffected, because a book is quoted from its own on-chain
state and there is nothing to drift against.

Rebuild when a DCA starts failing on slippage, or before a demo:

```bash
# 1. Restart anvil so it re-forks at head. Any variable change redeploys the service.
#    (Railway → base-fork → Variables, or the MCP `set_variables` call.)

# 2. Redeploy the contracts and fund the wallet. OWNER_ADDRESS is read if no argument is given.
cd server
set -a && . ../.env && set +a
export FORK_RPC=https://base-fork-production.up.railway.app XORR_CHAIN=base-fork
npx tsx src/fork-bootstrap.ts 0xYourWallet      # writes server/.env.fork

# 2b. The bootstrap funds the delegate key on THIS machine. The deployed executor signs with its
#     own key, which only Railway holds — read its address from `/delegation/params` (signed in)
#     and fund that one too, or every run dies at signing for want of gas.
DELEGATE=0xC38f38f45463f77bD823FebE16b15714Eb98c8A5
curl -s -XPOST -H 'content-type: application/json' "$FORK_RPC" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"anvil_setBalance\",\"params\":[\"$DELEGATE\",\"0x8AC7230489E80000\"]}"

# 3. Point the executor at the new addresses — Railway vars on `executor-fork`:
#    DELEGATION_ADDRESS, AQUA_BOOK_ADDRESS, SWAPVM_BOOK_ADDRESS. Setting them redeploys it.

# 4. Grant. Privy cannot sign for a fork of Base — chain 8453 is indistinguishable from real Base
#    to its RPC — so this impersonates the owner instead. Name the DEPLOYED delegate: without
#    XORR_DELEGATE_ADDRESS the grant goes to this machine's key and the executor reverts NotDelegate.
set -a && . ./.env.fork && set +a
XORR_DELEGATE_ADDRESS=$DELEGATE npx tsx src/fork-grant.ts 0xYourWallet 2810

# 5. Confirm.
curl -s "$FORK_API/verify?owner=0xYourWallet" | jq '.passed, .failed'
```

The database is untouched by all of this: the audit trail, strategies and positions live in
Postgres and survive. What is lost is on-chain state — the old contract addresses stop existing,
so anything holding a balance on the previous fork is gone with it.

## 9. Where it runs

| Piece | Host | Name |
|---|---|---|
| The app (static web export) | Vercel | project `xorr-eth` → `https://xorr-eth.vercel.app` |
| Executor, Base Sepolia | Railway | `executor` → `https://executor-production-1659.up.railway.app` (Postgres: `Postgres-gWN2`) |
| Executor, Base mainnet fork | Railway | `executor-fork` → `https://executor-fork-production.up.railway.app` (Postgres: `Postgres-WPy4`) |
| The fork itself (anvil) | Railway | `base-fork` → `https://base-fork-production.up.railway.app` — no volume, so a restart re-forks |

Redeploy the frontend with one command. It refuses to build against an executor that is down or
unreachable, reads the executor URL back out of the bundle, and deploys `dist-web` with a
`vercel.json` that serves the hashed bundles as immutable and falls back to `index.html` for every
client-side route:

```bash
npm run deploy:web          # XORR_WEB_API overrides the executor it points at
```

The executor's CORS is `ALLOWED_ORIGINS` on each Railway service — `*` today. If it is ever narrowed,
the Vercel origin has to be in the list or the app loads and every request fails.

**Recovering a project scheduled for deletion.** On 2026-09-11, during the move of the frontend to
Vercel, the whole Railway project was scheduled for deletion. Every
deployment stopped and the variables locked, but volumes and variables survive the 48-hour window.
Cancelling brought everything back — the services redeployed on their own, both databases intact —
except the fork, whose chain state has no volume; it was rebuilt with section 8. The call is the
dashboard's restore, or the API's `projectScheduleDeleteCancel(id)`.
