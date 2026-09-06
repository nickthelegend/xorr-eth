/**
 * What the app positively knows about whether anyone is signed in.
 *
 * `api` refuses to send an authenticated request without a token, which stopped a signed-out
 * visitor producing a 401 for every read on the home screen. But "no token" and "no token YET" are
 * different, and conflating them was worse than the problem it fixed: on a freshly established
 * Privy session the token is briefly unavailable, so every read fired in that window was silently
 * dropped — not attempted, not retried, not logged — and the screen rendered its empty state
 * permanently. Fifty-three routes made two authenticated requests between them.
 *
 * So the guard only applies when the answer is KNOWN to be "signed out". While it is unknown the
 * request goes out, exactly as it always did: at worst it 401s, which is visible, recoverable and
 * honest. Silence is none of those.
 */
export type AuthKnowledge = 'unknown' | 'signed-in' | 'signed-out';

let state: AuthKnowledge = 'unknown';

/** Set from Privy's own `ready` / `authenticated`, which is the only thing that actually knows. */
export function setAuthKnowledge(next: AuthKnowledge): void {
  state = next;
}

export function authKnowledge(): AuthKnowledge {
  return state;
}

/** Testing only. */
export function resetAuthKnowledge(): void {
  state = 'unknown';
}
