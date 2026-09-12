/**
 * Who is signed in, as Privy knows them — the email the account was made with.
 *
 * Split by platform like `useAuth`: the Expo SDK and the web SDK shape their user differently. Only
 * the email is read here. The wallet address comes from the executor, which is the authority on
 * which wallet the app is actually using.
 */
import { usePrivy } from '@privy-io/expo';

/** The one field of a linked account this reads. The Expo SDK types the list loosely. */
type LinkedAccount = { type?: string; address?: string };

export function usePrivyIdentity(): { email: string | null } {
  const { user } = usePrivy();
  const accounts = (user as { linked_accounts?: LinkedAccount[] } | null)?.linked_accounts ?? [];
  return { email: accounts.find((a) => a.type === 'email')?.address ?? null };
}
