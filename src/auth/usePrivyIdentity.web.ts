/**
 * Who is signed in, as Privy knows them — web. See `usePrivyIdentity.native.ts`.
 */
import { usePrivy } from '@privy-io/react-auth';

export function usePrivyIdentity(): { email: string | null } {
  const { user } = usePrivy();
  return { email: user?.email?.address ?? null };
}
