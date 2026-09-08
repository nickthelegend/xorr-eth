/**
 * Privy's "you already have an embedded wallet" refusal, recognised.
 *
 * `createWallet()` is guarded by `if (address) return address`, and that guard is stale exactly
 * once: in the render immediately after `loginWithCode` resolves, the SDK's `wallets` array has
 * not repopulated yet, so a returning user looks wallet-less for a beat. Onboarding then asks for
 * a wallet, Privy refuses because one exists, and the screen printed the SDK's developer message
 * verbatim, in red, underneath four green ticks:
 *
 *   > Wallet already exists for this user. Set 'createAdditional' to 'true' to create another
 *   > wallet.
 *
 * Nothing failed. The postcondition the caller wanted — this user has an embedded wallet — held
 * before the call. Treating that as success is not swallowing an error; every other failure still
 * propagates, which is why this matches on the specific refusal rather than catching broadly.
 *
 * The message is the only signal the SDK gives: there is no code or typed error to switch on.
 */
export function alreadyHasWallet(e: unknown): boolean {
  const message = e instanceof Error ? e.message : String(e);
  return /already exists/i.test(message) && /wallet/i.test(message);
}
