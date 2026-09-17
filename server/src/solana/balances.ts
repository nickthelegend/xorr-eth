/**
 * Token and SOL balance reads on Solana: ATA balances for USDC / xStocks and native SOL (PLAN.md §8.1).
 */
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  getScaledUiAmountConfig,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAccount,
  getMint,
  TokenAccountNotFoundError,
  TokenInvalidAccountOwnerError,
  type Mint,
} from '@solana/spl-token';
import { connection as defaultConnection, getConnection } from './connection.js';
import { DEFAULT_MINTS, getClusterConfig } from './clusters.js';

export interface TokenBalance {
  amount: number;
  raw: bigint;
  decimals: number;
}

export interface SolBalance {
  amount: number;
  lamports: bigint;
}

export interface WalletBalances {
  owner: string;
  usdc: TokenBalance;
  sol: SolBalance;
  usdcAta: string;
}

export type TokenBalanceResult = {
  amount: bigint;
  uiAmount: number;
  decimals: number;
  ata: PublicKey;
};

// Known Token-2022 mints
const TOKEN_2022_MINTS = new Set<string>([
  'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh', // NVDAx
  'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB', // TSLAx
  'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp', // AAPLx
  'XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX', // MSFTx
  'Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg', // AMZNx
  'XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN', // GOOGLx
  'Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu', // METAx
  'XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ', // MSTRx
  'Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu', // COINx
  'XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W', // SPYx
  'Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ', // QQQx
]);

export function toPublicKey(key: string | PublicKey): PublicKey {
  return typeof key === 'string' ? new PublicKey(key) : key;
}

/**
 * Determine program ID for a given token mint.
 */
export function tokenProgramForMint(mint: PublicKey | string): PublicKey {
  const str = typeof mint === 'string' ? mint : mint.toBase58();
  return TOKEN_2022_MINTS.has(str) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
}

/**
 * Decimals for a known mint, without an RPC round trip.
 *
 * This is a lookup, not a fact: it is right only for the mints listed above. Anything that
 * reports a balance or builds a `transferChecked` should read the mint instead, via
 * `readMintScale`. Kept for callers that have no connection to hand.
 */
export function decimalsForMint(mint: PublicKey | string): number {
  const str = typeof mint === 'string' ? mint : mint.toBase58();
  if (TOKEN_2022_MINTS.has(str)) {
    return 8; // Backed Finance xStocks are 8 decimals
  }
  return 6; // Default settlement token USDC is 6 decimals
}

/**
 * Compute the Associated Token Address (ATA) for an owner and mint.
 * The mint defaults to the active cluster's settlement USDC.
 */
export function ataFor(
  owner: PublicKey | string,
  mint?: PublicKey | string,
  programId?: PublicKey,
): PublicKey {
  const ownerPk = toPublicKey(owner);
  const mintPk = mint ? toPublicKey(mint) : new PublicKey(getClusterConfig().usdcMint);
  const prog = programId ?? tokenProgramForMint(mintPk);
  return getAssociatedTokenAddressSync(mintPk, ownerPk, false, prog);
}

/**
 * Reads token account balance for an owner and mint.
 * If the account does not exist, returns zeros rather than throwing.
 */
export async function readTokenBalance(
  owner: string | PublicKey,
  mint?: string | PublicKey,
  conn?: Connection,
): Promise<TokenBalance> {
  const connection = conn ?? getConnection();
  const mintPk = mint ? toPublicKey(mint) : new PublicKey(getClusterConfig().usdcMint);
  const ata = ataFor(owner, mintPk);
  const decimals = getClusterConfig().decimals.usdc;

  try {
    const account = await getAccount(connection, ata);
    return {
      amount: Number(account.amount) / Math.pow(10, decimals),
      raw: account.amount,
      decimals,
    };
  } catch (error: unknown) {
    if (error instanceof TokenAccountNotFoundError || error instanceof TokenInvalidAccountOwnerError) {
      return { amount: 0, raw: 0n, decimals };
    }
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('could not find account') || msg.includes('Account does not exist')) {
      return { amount: 0, raw: 0n, decimals };
    }
    throw error;
  }
}

/**
 * Reads native SOL balance for an owner.
 */
export async function readSolBalance(
  owner: string | PublicKey,
  conn?: Connection,
): Promise<SolBalance> {
  const connection = conn ?? getConnection();
  const lamports = await connection.getBalance(toPublicKey(owner));
  return {
    amount: lamports / LAMPORTS_PER_SOL,
    lamports: BigInt(lamports),
  };
}

/**
 * Reads both USDC ATA balance and native SOL balance for an owner.
 */
export async function readSolanaBalances(
  owner: string | PublicKey,
  conn?: Connection,
): Promise<WalletBalances> {
  const connection = conn ?? getConnection();
  const ownerPk = toPublicKey(owner);
  const [usdc, sol] = await Promise.all([
    readTokenBalance(ownerPk, undefined, connection),
    readSolBalance(ownerPk, connection),
  ]);

  return {
    owner: ownerPk.toBase58(),
    usdc,
    sol,
    usdcAta: ataFor(ownerPk).toBase58(),
  };
}

/**
 * Fetch native SOL balance.
 */
export async function getSolBalance(
  owner: PublicKey | string,
  conn: Connection = defaultConnection,
): Promise<{ lamports: bigint; sol: number }> {
  const lamports = BigInt(await conn.getBalance(toPublicKey(owner)));
  return {
    lamports,
    sol: Number(lamports) / LAMPORTS_PER_SOL,
  };
}

/**
 * The Scaled UI Amount multiplier in force for a mint at a given moment.
 *
 * Token-2022's Scaled UI Amount extension is how an issuer expresses a stock split or a
 * dividend: the raw balance never moves, the multiplier does, and the displayed balance is
 * raw x multiplier. The extension carries the next multiplier alongside the current one, so
 * which of the two applies is a question about the clock.
 *
 * Mints without the extension scale by 1.
 */
export function scaledUiMultiplier(mintInfo: Mint, atUnixSeconds = Date.now() / 1000): number {
  const config = getScaledUiAmountConfig(mintInfo);
  if (!config) return 1;
  return atUnixSeconds >= Number(config.newMultiplierEffectiveTimestamp)
    ? config.newMultiplier
    : config.multiplier;
}

/**
 * Read a mint's actual decimals and its current Scaled UI multiplier.
 */
export async function readMintScale(
  mint: PublicKey | string,
  conn: Connection = defaultConnection,
  programId?: PublicKey,
): Promise<{ decimals: number; multiplier: number }> {
  const mintPk = toPublicKey(mint);
  const prog = programId ?? tokenProgramForMint(mintPk);
  const mintInfo = await getMint(conn, mintPk, 'confirmed', prog);
  return { decimals: mintInfo.decimals, multiplier: scaledUiMultiplier(mintInfo) };
}

/**
 * Fetch token account balance for a given mint.
 *
 * `uiAmount` is what the holder owns, which for an xStock is not `amount / 10 ** decimals`:
 * these are Token-2022 mints carrying the Scaled UI Amount extension, and every split or
 * dividend moves the multiplier rather than the raw balance. Both the decimals and the
 * multiplier are read from the mint — assuming either is how a balance goes quietly wrong
 * the first time an issuer acts.
 */
export async function getTokenBalance(
  owner: PublicKey | string,
  mint: PublicKey | string = DEFAULT_MINTS.USDC,
  conn: Connection = defaultConnection,
): Promise<TokenBalanceResult> {
  const ownerPk = toPublicKey(owner);
  const mintPk = toPublicKey(mint);
  const prog = tokenProgramForMint(mintPk);
  const ata = ataFor(ownerPk, mintPk, prog);

  const { decimals, multiplier } = await readMintScale(mintPk, conn, prog);

  try {
    const acc = await getAccount(conn, ata, 'confirmed', prog);
    return {
      amount: acc.amount,
      uiAmount: (Number(acc.amount) / 10 ** decimals) * multiplier,
      decimals,
      ata,
    };
  } catch (e) {
    if (e instanceof TokenAccountNotFoundError || e instanceof TokenInvalidAccountOwnerError) {
      return { amount: 0n, uiAmount: 0, decimals, ata };
    }
    throw e;
  }
}
