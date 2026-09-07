/**
 * A Privy policy on the user's own wallet — the second lock.
 *
 * `XorrDelegation` bounds what the BOT may do with the user's money: capped per day, venue
 * allowlisted, time-boxed, revocable. It says nothing at all about what the user's own wallet may
 * be asked to sign, and that is a real gap. Privy's embedded wallet signs whatever the app in
 * front of it requests; a compromised bundle, a hostile dependency, or a bug in our own code could
 * put a transfer to an attacker's address in front of the user, and the on-chain delegation would
 * not care, because the delegation only governs the delegate.
 *
 * So the same shape of rule is applied one layer up, where Privy enforces it: this wallet may send
 * to the delegation contract, to the tokens the delegation is allowed to pull, and to the lending
 * pool — and nowhere else. Privy refuses anything outside that list before a signature exists,
 * which means it holds even if everything on this side of the wire is lying.
 *
 * The two locks are deliberately different in kind. The contract is public and the user can read
 * it without us; the Privy policy is enforced by the custodian of the key itself. Neither is a
 * substitute for the other, and a demo that shows both is showing defence in depth rather than
 * claiming it.
 *
 * (It is also the ETHOnline B2B criterion the project scored zero on — "at least one Privy
 * control, such as policies, signers, key quorums, or intents" — which is worth stating plainly
 * rather than pretending the engineering was the only motive.)
 */
import type { Address } from 'viem';
import { ADDRESSES, AAVE_V3_POOL, CHAIN_KEY, IS_BASE_MAINNET_STATE } from '../evm/chains.js';
import { DELEGATION_ADDRESS } from '../evm/delegation.js';
import { STOCKS } from '../venues/stocks.js';
import { one, query } from '../db/index.js';
import { createSign, createPrivateKey } from 'node:crypto';

const APP_ID = process.env.PRIVY_APP_ID!;
const APP_SECRET = process.env.PRIVY_APP_SECRET!;
const BASE = 'https://api.privy.io/v1';

/**
 * The policy is named after the deployment, not the app.
 *
 * One Privy app serves both the Sepolia and the fork executor, and they allow different addresses
 * — a Sepolia USDC that does not exist on mainnet, equities that exist only on mainnet. A single
 * shared policy would either be wrong for one of them or be the union of both, which is a wider
 * permission than either deployment can justify.
 */
export const POLICY_NAME = `xorr wallet policy (${CHAIN_KEY})`;

type PrivyRule = {
  name: string;
  method: 'eth_sendTransaction';
  action: 'ALLOW';
  conditions: { field_source: 'ethereum_transaction'; field: 'to'; operator: 'eq'; value: string }[];
};

export type PrivyPolicy = {
  id: string;
  name: string;
  chain_type: string;
  rules: (PrivyRule & { id?: string })[];
  owner_id: string | null;
};

/**
 * The executor's authorization key — the other half of the control.
 *
 * A policy that the app secret alone can rewrite is not a constraint on the app; it is a comment.
 * So the policy is OWNED by a Privy key quorum, and Privy then refuses any change to it that is
 * not signed by that quorum's key. Verified against the live API: with the owner set, an unsigned
 * PATCH adding a rule that allows sends to `0x…dead` comes back
 *
 *   401 Missing `privy-authorization-signature` header
 *
 * — holding the app id and the app secret. That is the property worth having: compromising this
 * server does not widen what the user's wallet may do.
 *
 * Absent, everything here still works read-only, and `ensurePolicy` can still create a first
 * unowned policy. Only changes to an owned one need the key, which is the correct blast radius.
 */
const AUTH_KEY = process.env.PRIVY_AUTHORIZATION_KEY;

/**
 * The key quorum that owns the policy.
 *
 * Set at CREATION, not afterwards. A policy is born unowned, and an unowned policy is one the app
 * secret can rewrite at will — which makes it a comment rather than a control. The window between
 * creating one and claiming it is small and entirely avoidable.
 *
 * This is not hypothetical: the first deployment of this code created its own policy against its
 * own database, left it unowned, and `/verify` reported exactly that — "4 rules but no owner". The
 * check was right and the code was wrong.
 */
const KEY_QUORUM_ID = process.env.PRIVY_KEY_QUORUM_ID;

/**
 * RFC 8785 canonical JSON — keys sorted, at every depth.
 *
 * The server rebuilds this string from the request it received and verifies the signature against
 * it, so byte-for-byte agreement is the whole game. `JSON.stringify` emits keys in insertion
 * order, which produced a signature Privy rejected with "your payload may be malformed" — correct
 * ECDSA over the wrong bytes.
 */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

/**
 * Privy's canonical request payload, signed with ECDSA P-256.
 *
 * Key order matters: the server rebuilds this string from the request it received and compares
 * signatures, so the fields are serialised in the order Privy specifies rather than whatever order
 * an object literal happens to produce.
 */
function authorizationSignature(method: string, path: string, body: unknown): string | undefined {
  if (!AUTH_KEY) return undefined;
  const payload = canonicalJson({
    version: 1,
    method,
    url: `${BASE}${path}`,
    body: body ?? {},
    headers: { 'privy-app-id': APP_ID },
  });
  const key = createPrivateKey({
    key: Buffer.from(AUTH_KEY, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  return createSign('SHA256').update(payload).end().sign(key).toString('base64');
}

async function privyFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? 'GET';
  const parsed = init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined;
  // Only a mutation can need one, and asking for a signature on a GET would sign a payload the
  // server never builds.
  const sig = method === 'GET' ? undefined : authorizationSignature(method, path, parsed);
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Basic ${Buffer.from(`${APP_ID}:${APP_SECRET}`).toString('base64')}`,
      'privy-app-id': APP_ID,
      'content-type': 'application/json',
      ...(sig ? { 'privy-authorization-signature': sig } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(`Privy ${init?.method ?? 'GET'} ${path} → ${res.status}: ${body.error ?? ''}`);
  }
  return body;
}

/**
 * Every address this wallet has a legitimate reason to send to, and no others.
 *
 * Derived from the same registries the app itself uses, so a token that becomes tradable becomes
 * allowed in the same change rather than two releases later — and, more importantly, a token that
 * is NOT tradable is never allowed by accident.
 */
export function allowedDestinations(): { label: string; address: string }[] {
  const out: { label: string; address: string }[] = [
    { label: 'XorrDelegation — grant, revoke', address: DELEGATION_ADDRESS },
    { label: 'USDC — approve, transfer', address: ADDRESSES.usdcBase },
    { label: 'WETH — approve, transfer', address: ADDRESSES.wethBase },
    { label: 'cbBTC — approve, transfer', address: ADDRESSES.cbbtcBase },
  ];
  if (IS_BASE_MAINNET_STATE) {
    out.push({ label: 'Aave v3 pool — supply, withdraw', address: AAVE_V3_POOL });
    for (const s of Object.values(STOCKS)) {
      out.push({ label: `${s.symbol} — approve, transfer`, address: s.address });
    }
  }
  // Privy compares `to` as a string. Lowercase both sides so a checksummed address in a request
  // cannot slip past a rule written with different casing.
  return out.map((d) => ({ ...d, address: d.address.toLowerCase() }));
}

function desiredRules(): PrivyRule[] {
  return allowedDestinations().map((d) => ({
    name: d.label,
    method: 'eth_sendTransaction' as const,
    action: 'ALLOW' as const,
    conditions: [
      { field_source: 'ethereum_transaction' as const, field: 'to' as const, operator: 'eq' as const, value: d.address },
    ],
  }));
}

export async function getPolicy(id: string): Promise<PrivyPolicy> {
  return privyFetch<PrivyPolicy>(`/policies/${id}`);
}

/**
 * Where the policy id lives, and why it is not a variable.
 *
 * Privy's API creates a policy, reads one by id and patches one. It does not list them —
 * `GET /v1/policies` answers 405 — so the id it mints is the only handle that will ever exist. An
 * executor that holds it in memory creates a second policy on the next deploy while every wallet
 * still points at the first, which nothing then updates again.
 *
 * A file on disk is no better: the container is rebuilt on every deploy. That is precisely how the
 * delegate key came to be regenerated with every grant left naming a key nobody held. Same shape
 * of bug, so the same answer — the database, which outlives the process.
 */
const CONFIG_KEY = `privy_policy_id:${CHAIN_KEY}`;

async function rememberedPolicyId(): Promise<string | undefined> {
  const row = await one<{ value: string }>(`SELECT value FROM app_config WHERE key = $1`, [
    CONFIG_KEY,
  ]);
  return row?.value;
}

async function rememberPolicyId(id: string): Promise<void> {
  await query(
    `INSERT INTO app_config (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [CONFIG_KEY, id],
  );
}

/**
 * Create the policy, or bring an existing one up to date.
 *
 * Idempotent by name, because this runs on boot and on every provision request. Rewriting the
 * rules when they differ matters more than it looks: the allowed set is derived from the chain
 * config, so a deployment that gains a token must not keep enforcing yesterday's list — a policy
 * that silently blocks a legitimate approval is indistinguishable, from the user's side, from the
 * wallet being broken.
 */
export async function ensurePolicy(): Promise<PrivyPolicy> {
  const wanted = desiredRules();
  const knownId = await rememberedPolicyId();
  // A remembered id that Privy no longer recognises is a deleted policy, not a fatal error: fall
  // through and mint a new one rather than leaving every wallet unprotected over a stale row.
  const existing = knownId ? await getPolicy(knownId).catch(() => undefined) : undefined;

  if (!existing) {
    const created = await privyFetch<PrivyPolicy>('/policies', {
      method: 'POST',
      body: JSON.stringify({
        version: '1.0',
        name: POLICY_NAME,
        chain_type: 'ethereum',
        rules: wanted,
        ...(KEY_QUORUM_ID ? { owner_id: KEY_QUORUM_ID } : {}),
      }),
    });
    await rememberPolicyId(created.id);
    return created;
  }

  /*
   * An existing policy that nobody owns is still worth claiming.
   *
   * Deployments made before the quorum existed left one behind, and leaving it unowned means the
   * app secret alone can widen what the wallet may do — the exact hole this is meant to close.
   * Claiming it needs no signature precisely because it has no owner yet.
   */
  if (!existing.owner_id && KEY_QUORUM_ID) {
    await privyFetch(`/policies/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ owner_id: KEY_QUORUM_ID }),
    }).catch(() => undefined);
  }

  const same =
    existing.rules.length === wanted.length &&
    wanted.every((w) =>
      existing.rules.some(
        (e) => e.conditions?.[0]?.value?.toLowerCase() === w.conditions[0]!.value,
      ),
    );
  if (same) return existing;

  return privyFetch<PrivyPolicy>(`/policies/${existing.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ rules: wanted }),
  });
}

export type PrivyWallet = {
  id: string;
  address: string;
  policy_ids: string[];
  additional_signers: unknown[];
  owner_id: string | null;
};

export async function findWallet(address: string): Promise<PrivyWallet | undefined> {
  const r = await privyFetch<{ data: PrivyWallet[] }>('/wallets');
  return (r.data ?? []).find((w) => w.address.toLowerCase() === address.toLowerCase());
}

/**
 * Put the policy on the wallet.
 *
 * Returns what actually happened rather than a boolean: "already had it" and "just got it" are
 * different facts, and the screen that reports this to a user should not have to guess which.
 */
export async function attachPolicy(
  address: string,
): Promise<{ walletId: string; policyId: string; changed: boolean }> {
  const [policy, wallet] = await Promise.all([ensurePolicy(), findWallet(address)]);
  if (!wallet) throw new Error(`No Privy wallet for ${address}`);

  if (wallet.policy_ids.includes(policy.id)) {
    return { walletId: wallet.id, policyId: policy.id, changed: false };
  }
  await privyFetch(`/wallets/${wallet.id}`, {
    method: 'PATCH',
    // Replace rather than append: two policies on one wallet is a union of permissions, which is
    // the opposite of what a policy is for.
    body: JSON.stringify({ policy_ids: [policy.id] }),
  });
  return { walletId: wallet.id, policyId: policy.id, changed: true };
}

/**
 * What Privy says is enforced on this wallet, right now.
 *
 * Read back from Privy rather than reported from our own memory of what we asked for — the whole
 * argument of this project is that a claim you cannot check is not evidence, and that applies to
 * our own controls first.
 */
export async function policyStatus(address: string): Promise<{
  enforced: boolean;
  policyId?: string;
  policyName?: string;
  walletId?: string;
  allowed: { label: string; address: string }[];
  ownerId: string | null;
}> {
  const wallet = await findWallet(address);
  if (!wallet || wallet.policy_ids.length === 0) {
    return { enforced: false, walletId: wallet?.id, allowed: [], ownerId: wallet?.owner_id ?? null };
  }
  const policy = await getPolicy(wallet.policy_ids[0]!);
  return {
    enforced: true,
    policyId: policy.id,
    policyName: policy.name,
    walletId: wallet.id,
    allowed: policy.rules.map((r) => ({
      label: r.name,
      address: String(r.conditions?.[0]?.value ?? ''),
    })),
    ownerId: policy.owner_id,
  };
}


/**
 * Prove the signature works, against the live API, rather than assuming it.
 *
 * A signing implementation that is never exercised is a claim, and the whole argument of this
 * project is that claims are worthless. This performs a real owned-policy write — the operation
 * that is refused outright without a valid signature — so `/verify` can report that the executor
 * still holds a key the quorum accepts.
 */
export async function proveAuthorizationKey(): Promise<{ signed: boolean; detail: string }> {
  const policy = await ensurePolicy();
  if (!policy.owner_id) return { signed: false, detail: 'policy has no owner, so nothing is gated' };
  if (!AUTH_KEY) return { signed: false, detail: 'PRIVY_AUTHORIZATION_KEY is not set' };
  try {
    // A no-op write: the same rules it already has. It still has to be signed.
    await privyFetch(`/policies/${policy.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ rules: desiredRules() }),
    });
    return { signed: true, detail: `signed write accepted on ${policy.id} (owner ${policy.owner_id})` };
  } catch (e) {
    return { signed: false, detail: e instanceof Error ? e.message : String(e) };
  }
}


/**
 * Make this wallet do something, through Privy, under its policy.
 *
 * Exported so the refusal can be demonstrated rather than described. A policy nobody has watched
 * say no is a configuration screenshot; the interesting artefact is Privy declining a transaction
 * this server asked for, while holding every credential this server has.
 */
export async function rpcAsWallet(walletId: string, body: unknown): Promise<unknown> {
  return privyFetch(`/wallets/${walletId}/rpc`, { method: 'POST', body: JSON.stringify(body) });
}


/**
 * The wallet that exists to be told no.
 *
 * A policy-bound wallet the SERVER owns, so the refusal can be demonstrated on demand without
 * touching anyone's funds — it holds nothing and every test against it is zero-value. The user's
 * own embedded wallet cannot be used for this: Privy makes its owner authorise any change, and
 * that owner is the user, which is exactly the right answer and exactly the wrong thing to demand
 * mid-demo.
 *
 * Created once and remembered, for the same reason the policy id is: the container is rebuilt on
 * every deploy and a wallet minted per boot would leave a trail of orphans.
 */
const DEMO_WALLET_KEY = `privy_demo_wallet:${CHAIN_KEY}`;

export async function demoWalletId(): Promise<string | undefined> {
  const row = await one<{ value: string }>(`SELECT value FROM app_config WHERE key = $1`, [
    DEMO_WALLET_KEY,
  ]);
  if (row?.value) return row.value;

  const policy = await ensurePolicy();
  const created = await privyFetch<PrivyWallet>('/wallets', {
    method: 'POST',
    body: JSON.stringify({
      chain_type: 'ethereum',
      policy_ids: [policy.id],
      ...(policy.owner_id ? { owner_id: policy.owner_id } : {}),
    }),
  });
  await query(
    `INSERT INTO app_config (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [DEMO_WALLET_KEY, created.id],
  );
  return created.id;
}
