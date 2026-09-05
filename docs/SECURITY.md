# Security review — PLAN.md 13.11

Scope: the delegation primitive, key storage, the executor's blast radius, and the client/server
trust boundary. Written against the code as it stands, not against intentions.

## 1. The delegation primitive — the thing standing between a bug and someone's capital

**What it is.** SPL Token `approve(ownerTokenAccount, delegate, amount)`. Implemented in
`server/src/solana/delegation.ts`; proven in `delegation.chain.test.ts` against a real Solana
runtime.

**What the delegate CAN do**
- Transfer up to the approved amount, from one specific token account.

**What the delegate CANNOT do — enforced by the token program, not by our code**
- Exceed the approved amount. Proven: an over-cap transfer throws, and the allowance is unchanged.
- Touch any other token account, mint, or the SOL balance.
- Close the account or reassign its owner.
- Survive a revoke. Proven: after `revoke`, a 1-cent transfer fails.

**Residual risk**
- The approved amount is a TOTAL allowance, not a per-day one. The executor enforces the daily
  boundary (`daily_spend` + `rules/engine.ts`), and that half IS executor-side. An executor
  compromise could spend the remaining on-chain allowance within a single approval window.
  *Mitigation in place:* the approval is sized to the daily cap and re-approved per period, so the
  on-chain exposure equals one day's cap rather than the account balance.
  *Not yet done:* moving the day boundary itself on-chain would need a custom program (Anchor).
  Tracked as a known limitation, not a silent one.

## 2. Key storage

| Key | Where it lives | Blast radius if stolen |
|---|---|---|
| Owner (user) | The user's device. `expo-secure-store` in the app; `server/.keys` on a dev machine ONLY, gitignored. | Total loss of that wallet. Hence `app/recovery.tsx` states plainly that xorr cannot recover it. |
| Delegate (bot) | The executor host. | Bounded by §1: at most the remaining approved allowance. Cannot withdraw. |
| Payer | The executor host. | Transaction fees only. |

`server/.keys` is written `0o600` and is in `.gitignore`. **Before any deployment carrying real
value, the delegate key must move to a KMS or an HSM** — a file on a host is adequate for a
localnet/devnet build and is not adequate beyond that. Recorded as a gap, not as done.

## 3. Client/server trust boundary

**No limit is enforced client-side.** Verified two ways:
- `src/data/repositories.test.ts` fails the build if any screen or component calls `fetch`.
- `server/src/rules/engine.ts` re-evaluates every limit on the server, and
  `executor.chain.test.ts` proves an over-cap run is blocked even when the client asks for it.

The client's stepper sets a *requested* cap; the server decides. A tampered client can ask for
anything and gets the same answer.

## 4. Replay and double-spend

`strategy_runs.period_key` is `UNIQUE`. Claiming a run is an INSERT, so there is no window between
"check" and "act". Proven adversarially: five sequential retries and four concurrent calls against
the same strategy produce exactly one fill.

Proposal decisions use the same shape — the `UPDATE` matches only an undecided, unexpired row, so
a double-approve cannot double-fill.

## 5. The audit trail

Append-only via a database trigger (an `UPDATE` or `DELETE` raises). Hash-chained with canonical
JSON, so a tampered row breaks verification for everything after it. The export carries its own
verification result, so a recipient does not have to trust the exporter.

*Known limitation:* the chain proves internal consistency, not third-party attestation. A party
with database superuser rights could drop the trigger and rebuild the chain. Anchoring a periodic
digest on-chain would close that and is not yet done.

## 6. Biometrics

`expo-local-authentication` gates the kill switch and the delegation grant. If no hardware or no
enrolment is present the app proceeds — a device without biometrics must still be able to STOP its
bot, and blocking the kill switch behind unavailable hardware would be a worse failure than the one
it prevents. Payout paths should not make the same trade; they are gated by the allowlist instead.

## 7. Withdrawal allowlist

Withdrawals may only target an allowlisted address, and a newly added address is unusable for 24
hours (`src/wallet/allowlist.ts`). This is what stops a stolen unlocked phone from adding an
address and draining the wallet in one session. **The cooling-off is currently client-side; it must
move to the server before real value flows.** Recorded as a gap.

## 8. Network

- The app talks to exactly one first-party origin (`EXPO_PUBLIC_API_URL`) plus two public price
  APIs. No user data is sent to either price API.
- The server refuses to start against `mainnet-beta` without an explicit `ALLOW_MAINNET=yes`.
- Certificate pinning is not implemented. Required before a production release.

## 9. What this review did NOT cover

- A third-party audit of the delegation flow. PLAN.md 13.11 calls for one and it has not happened.
- Jailbreak/root detection.
- Rate limiting and authentication on the executor API: the dev server is single-user and has no
  auth. **This is the largest open item** and is tracked as PLAN.md 11.3 / [G21].
