/**
 * Publishing the audit trail's head hash to Base, so its integrity stops being our word.
 *
 * `audit_log` is append-only by trigger and every row commits to its predecessor, so an edit
 * breaks the chain and `/verify` says so. That property is real and it has one honest limit:
 * every part of it lives in our database. A reader who does not trust the operator has no reason
 * to trust the operator's report that the operator's log is intact — the whole trail could be
 * rebuilt, rows and hashes together, and nothing outside would know.
 *
 * An anchor closes that. The head hash goes onto Base at a known block, signed by the same
 * delegate key the app names on screen as the bot's key. Rewriting history stays possible;
 * producing a rewrite that hashes to a value Base has held since before the rewrite does not.
 *
 * The unit of anchoring is a WALLET, because that is the unit the chain is built in: `verify()`
 * walks one wallet's rows from genesis, so one wallet's head is the only thing a hash can honestly
 * commit to.
 */
import type { Address, Hex } from 'viem';
import { publicClient, walletClient, delegateAccount } from '../evm/client.js';
import { one, query } from '../db/index.js';
import 'dotenv/config';

export const ANCHOR_ADDRESS = (process.env.ANCHOR_ADDRESS ??
  '0x0000000000000000000000000000000000000000') as Address;

/** True when this deployment has an anchor contract to write to. */
export function anchoringConfigured(): boolean {
  return ANCHOR_ADDRESS !== '0x0000000000000000000000000000000000000000';
}

export const ANCHOR_ABI = [
  {
    type: 'function',
    name: 'anchor',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'subject', type: 'address' },
      { name: 'head', type: 'bytes32' },
      { name: 'entryCount', type: 'uint64' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'count',
    stateMutability: 'view',
    inputs: [
      { name: 'anchorer', type: 'address' },
      { name: 'subject', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'latest',
    stateMutability: 'view',
    inputs: [
      { name: 'anchorer', type: 'address' },
      { name: 'subject', type: 'address' },
    ],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'head', type: 'bytes32' },
          { name: 'entryCount', type: 'uint64' },
          { name: 'at', type: 'uint64' },
          { name: 'blockNo', type: 'uint64' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'history',
    stateMutability: 'view',
    inputs: [
      { name: 'anchorer', type: 'address' },
      { name: 'subject', type: 'address' },
    ],
    outputs: [
      {
        type: 'tuple[]',
        components: [
          { name: 'head', type: 'bytes32' },
          { name: 'entryCount', type: 'uint64' },
          { name: 'at', type: 'uint64' },
          { name: 'blockNo', type: 'uint64' },
        ],
      },
    ],
  },
] as const;

export type OnChainAnchor = {
  head: Hex;
  entryCount: number;
  at: number;
  blockNo: number;
};

/** The trail's current head and length for one wallet, straight from the table. */
export async function localHead(
  walletId: string,
): Promise<{ head: Hex; entryCount: number } | undefined> {
  const row = await one<{ hash: string; n: string }>(
    `SELECT hash, (SELECT count(*) FROM audit_log WHERE wallet_id = $1)::text AS n
       FROM audit_log WHERE wallet_id = $1 ORDER BY seq DESC LIMIT 1`,
    [walletId],
  );
  if (!row) return undefined;
  return { head: `0x${row.hash.replace(/^0x/, '')}` as Hex, entryCount: Number(row.n) };
}

/** The most recent anchor OUR delegate key published about this wallet's owner. */
export async function latestAnchor(subject: Address): Promise<OnChainAnchor | undefined> {
  if (!anchoringConfigured()) return undefined;
  const a = (await publicClient.readContract({
    address: ANCHOR_ADDRESS,
    abi: ANCHOR_ABI,
    functionName: 'latest',
    args: [delegateAccount.address, subject],
  })) as { head: Hex; entryCount: bigint; at: bigint; blockNo: bigint };
  // `anchor()` refuses a zero head, so zero is unambiguously "never anchored".
  if (a.head === `0x${'0'.repeat(64)}`) return undefined;
  return {
    head: a.head,
    entryCount: Number(a.entryCount),
    at: Number(a.at),
    blockNo: Number(a.blockNo),
  };
}

/** Every anchor our key has published about this owner, oldest first. */
export async function anchorHistory(subject: Address): Promise<OnChainAnchor[]> {
  if (!anchoringConfigured()) return [];
  const rows = (await publicClient.readContract({
    address: ANCHOR_ADDRESS,
    abi: ANCHOR_ABI,
    functionName: 'history',
    args: [delegateAccount.address, subject],
  })) as readonly { head: Hex; entryCount: bigint; at: bigint; blockNo: bigint }[];
  return rows.map((a) => ({
    head: a.head,
    entryCount: Number(a.entryCount),
    at: Number(a.at),
    blockNo: Number(a.blockNo),
  }));
}

export type AnchorOutcome =
  | { anchored: true; txHash: Hex; head: Hex; entryCount: number }
  | { anchored: false; reason: 'not_configured' | 'no_entries' | 'unchanged'; detail: string };

/**
 * Publish this wallet's head, unless there is nothing new to say.
 *
 * Skipping an unchanged trail is not an optimisation, it is the correct behaviour: an anchor is a
 * commitment to a state, and re-committing to a state already on-chain costs gas to add nothing a
 * reader did not already have.
 */
export async function anchorWallet(
  walletId: string,
  owner: Address,
): Promise<AnchorOutcome> {
  if (!anchoringConfigured()) {
    return {
      anchored: false,
      reason: 'not_configured',
      detail: 'ANCHOR_ADDRESS is not set on this deployment.',
    };
  }

  const local = await localHead(walletId);
  if (!local) {
    return { anchored: false, reason: 'no_entries', detail: 'This wallet has no audit entries yet.' };
  }

  const onChain = await latestAnchor(owner);
  if (onChain && onChain.head.toLowerCase() === local.head.toLowerCase()) {
    return {
      anchored: false,
      reason: 'unchanged',
      detail: `Already anchored at entry ${onChain.entryCount}, block ${onChain.blockNo}.`,
    };
  }

  const txHash = await walletClient.writeContract({
    address: ANCHOR_ADDRESS,
    abi: ANCHOR_ABI,
    functionName: 'anchor',
    args: [owner, local.head, BigInt(local.entryCount)],
    account: delegateAccount,
    chain: walletClient.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });

  return { anchored: true, txHash, head: local.head, entryCount: local.entryCount };
}

export type AnchorAgreement =
  | { state: 'match'; anchor: OnChainAnchor; entryCount: number }
  | { state: 'ahead'; anchor: OnChainAnchor; entryCount: number }
  | { state: 'diverged'; anchor: OnChainAnchor; entryCount: number }
  | { state: 'none'; entryCount: number };

/**
 * Does the trail we hold still agree with what Base was told?
 *
 * Three answers, and the distinction matters:
 *
 * - `match`    — the head on-chain is the head we hold. Everything up to that entry is committed.
 * - `ahead`    — we hold MORE entries than were anchored. Normal: rows are written continuously and
 *                anchored on a cadence, so this is the usual state between anchors.
 * - `diverged` — the anchored entry count is one we have, and the head we hold at that length is
 *                NOT what was published. That is the alarm. It means the trail changed underneath a
 *                commitment, which is the exact thing anchoring exists to make visible.
 */
export async function agreement(walletId: string, owner: Address): Promise<AnchorAgreement> {
  const local = await localHead(walletId);
  const entryCount = local?.entryCount ?? 0;
  const onChain = await latestAnchor(owner);
  if (!onChain) return { state: 'none', entryCount };
  if (local && onChain.head.toLowerCase() === local.head.toLowerCase()) {
    return { state: 'match', anchor: onChain, entryCount };
  }
  if (entryCount > onChain.entryCount) {
    /*
     * More rows than were anchored is only innocent if the row AT the anchored length still hashes
     * to what was published. Comparing lengths alone would call a rewritten history "ahead" and
     * wave it through, which is the one mistake this function must not make.
     */
    const atAnchor = await one<{ hash: string }>(
      `SELECT hash FROM audit_log WHERE wallet_id = $1 ORDER BY seq ASC OFFSET $2 LIMIT 1`,
      [walletId, onChain.entryCount - 1],
    );
    const stillAgrees =
      atAnchor && `0x${atAnchor.hash.replace(/^0x/, '')}`.toLowerCase() === onChain.head.toLowerCase();
    return stillAgrees
      ? { state: 'ahead', anchor: onChain, entryCount }
      : { state: 'diverged', anchor: onChain, entryCount };
  }
  return { state: 'diverged', anchor: onChain, entryCount };
}

/** Every wallet that has audit rows — the set worth anchoring. */
export async function anchorableWallets(): Promise<{ id: string; address: Address }[]> {
  const rows = await query<{ id: string; address: string }>(
    `SELECT w.id, w.address FROM wallets w
      WHERE EXISTS (SELECT 1 FROM audit_log a WHERE a.wallet_id = w.id)`,
    [],
  );
  return rows.map((r) => ({ id: r.id, address: r.address as Address }));
}
