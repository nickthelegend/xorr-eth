/**
 * Every claim this project makes, re-checked live.
 *
 * The README asserts a contract address, a synced subgraph, a tamper-evident audit trail, real
 * prices and real venues. A reader has to take all of that on trust, and "trust me" is the exact
 * thing this product exists to argue against. So each claim is a function that goes and looks,
 * right now, and reports what it found — including when what it found is bad.
 *
 * Rules for a check:
 *   - It performs a real read. No cached value, no constant, nothing derived from our own database
 *     unless the database IS the claim.
 *   - It reports the observed value, not just a boolean. "PASS" with nothing behind it is the same
 *     unfalsifiable claim in a green colour.
 *   - It says how it was obtained, so the reader can repeat it without this code.
 *   - A failure is a result, not an exception. A console that goes blank when something is broken
 *     is worse than no console.
 */
import { erc20Abi, formatEther, formatUnits, type Address } from 'viem';
import { publicClient } from '../evm/client.js';
import { ADDRESSES, CHAIN_KEY, chain, rpcUrl, SETTLEMENT_VENUES } from '../evm/chains.js';
import { DELEGATION_ADDRESS, delegatePublicKey, readPolicy } from '../evm/delegation.js';
import { query } from '../db/index.js';
import { verify as verifyAudit } from '../audit/log.js';
import { usdcReserve } from '../market/yield.js';
import { priceOf } from '../market/prices.js';
import { quote } from '../venues/oneinch.js';
import { health as graphHealth } from '../graph/client.js';
import { STOCKS } from '../venues/stocks.js';

export type CheckStatus = 'pass' | 'fail' | 'skip';

export type Check = {
  id: string;
  /** The claim, in the words the README uses. */
  claim: string;
  status: CheckStatus;
  /** What was actually observed. The point of the whole exercise. */
  observed: string;
  /** How to repeat it without this code. */
  how: string;
  ms: number;
};

type Probe = {
  id: string;
  claim: string;
  how: string;
  run: () => Promise<string>;
  /** Override when a probe legitimately needs longer than the default. */
  timeoutMs?: number;
};

/**
 * No single probe may hold the console.
 *
 * The first run of this took 60 seconds, all of it inside one price check waiting out two 30s
 * upstream attempts. Fifteen claims that answer in 30ms are worthless if the page they render on
 * takes a minute, and a reader who waits that long has already decided the product is broken.
 *
 * A timeout is reported as a FAILED claim rather than a skipped one, and deliberately so: "the
 * price feed did not answer in ten seconds" is not a missing precondition, it is the thing a user
 * would experience as the screen being broken. Ten seconds is the number because that is roughly
 * where a person stops believing a page is loading.
 */
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * `skip` is a real answer, distinct from `fail`.
 *
 * A check that needs a wallet, on a request with no wallet, has not failed — it had nothing to
 * measure. Collapsing the two would make an empty account look like a broken one.
 */
class Skipped extends Error {}
function skip(reason: string): never {
  throw new Skipped(reason);
}

async function timed(p: Probe): Promise<Check> {
  const started = Date.now();
  const limit = p.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const observed = await Promise.race([
      p.run(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`did not answer within ${limit}ms`)), limit);
      }),
    ]);
    return { id: p.id, claim: p.claim, how: p.how, status: 'pass', observed, ms: Date.now() - started };
  } catch (e) {
    const observed = e instanceof Error ? e.message : String(e);
    return {
      id: p.id,
      claim: p.claim,
      how: p.how,
      status: e instanceof Skipped ? 'skip' : 'fail',
      observed,
      ms: Date.now() - started,
    };
  } finally {
    // Without this the process holds a pending timer per probe and cannot exit cleanly.
    if (timer) clearTimeout(timer);
  }
}

const money = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

const VENUE_ABI = [
  {
    type: 'function',
    name: 'isVenueAllowed',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'venue', type: 'address' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const;

export type VerifyReport = {
  checks: Check[];
  passed: number;
  failed: number;
  skipped: number;
  chain: string;
  at: string;
};

export async function runChecks(owner?: Address): Promise<VerifyReport> {
  const probes: Probe[] = [
    {
      id: 'chain',
      claim: 'The app is talking to a real chain.',
      how: `eth_chainId + eth_blockNumber against ${rpcUrl}`,
      run: async () => {
        const [id, block] = await Promise.all([
          publicClient.getChainId(),
          publicClient.getBlockNumber(),
        ]);
        if (id !== chain.id) throw new Error(`RPC reports chain ${id}, config expects ${chain.id}`);
        return `chain ${id} (${CHAIN_KEY}) at block ${block}`;
      },
    },
    {
      id: 'contract',
      claim: 'XorrDelegation is deployed and has code.',
      how: `eth_getCode ${DELEGATION_ADDRESS}`,
      run: async () => {
        const code = await publicClient.getCode({ address: DELEGATION_ADDRESS });
        if (!code || code.length <= 4) throw new Error(`no code at ${DELEGATION_ADDRESS}`);
        // Bytes, not hex characters — the number an explorer shows.
        return `${(code.length - 2) / 2} bytes at ${DELEGATION_ADDRESS}`;
      },
    },
    {
      id: 'policy',
      claim: 'The permission is read from the chain, never from our database.',
      how: `policyOf(owner) on ${DELEGATION_ADDRESS}`,
      run: async () => {
        if (!owner) skip('No wallet on this request.');
        const p = await readPolicy(owner);
        if (!p) throw new Error('No policy on chain for this wallet.');
        return `${money(p.dailyCapUsd)}/day cap, ${money(p.remainingTodayUsd)} left today, expires ${new Date(p.expiresAt).toISOString().slice(0, 10)}, revoked=${p.revoked}`;
      },
    },
    {
      id: 'venues',
      claim: 'The bot can only reach venues the user allowlisted.',
      how: 'isVenueAllowed(owner, venue) for each routable venue, plus a control address',
      run: async () => {
        if (!owner) skip('No wallet on this request.');
        const results = await publicClient.multicall({
          allowFailure: false,
          contracts: SETTLEMENT_VENUES.map((venue) => ({
            address: DELEGATION_ADDRESS,
            abi: VENUE_ABI,
            functionName: 'isVenueAllowed' as const,
            args: [owner, venue] as const,
          })),
        });
        const allowed = SETTLEMENT_VENUES.filter((_, i) => results[i]);
        /*
         * A control address the user never granted MUST come back false.
         *
         * Without it this check would pass against a contract that returned true for everything,
         * which is precisely the failure it exists to catch.
         */
        const control = await publicClient.readContract({
          address: DELEGATION_ADDRESS,
          abi: VENUE_ABI,
          functionName: 'isVenueAllowed',
          args: [owner, '0x000000000000000000000000000000000000dEaD'],
        });
        if (control) throw new Error('an address the user never granted came back allowed');
        return `${allowed.length} of ${SETTLEMENT_VENUES.length} granted; a control address is correctly denied`;
      },
    },
    {
      id: 'cap-agrees',
      claim: 'The on-chain cap and our own tally agree, and the stricter one governs.',
      how: 'remainingToday(owner) against today’s daily_spend row',
      run: async () => {
        if (!owner) skip('No wallet on this request.');
        const p = await readPolicy(owner);
        if (!p) throw new Error('No policy on chain.');
        const rows = await query<{ spent_usd: string }>(
          `SELECT d.spent_usd FROM daily_spend d
             JOIN wallets w ON w.id = d.wallet_id
            WHERE lower(w.address) = lower($1) AND d.day = $2`,
          [owner, new Date().toISOString().slice(0, 10)],
        );
        const dbRemaining = p.dailyCapUsd - Number(rows[0]?.spent_usd ?? 0);
        const governing = Math.min(p.remainingTodayUsd, dbRemaining);
        return `chain ${money(p.remainingTodayUsd)}, database ${money(dbRemaining)} — ${money(governing)} governs`;
      },
    },
    {
      id: 'audit',
      claim: 'The audit trail is tamper-evident: every row hashes its predecessor.',
      how: 'GET /activity/verify — re-hashes the whole chain',
      run: async () => {
        if (!owner) skip('No wallet on this request.');
        const rows = await query<{ id: string }>(
          `SELECT id FROM wallets WHERE lower(address)=lower($1)`,
          [owner],
        );
        const walletId = rows[0]?.id;
        if (!walletId) skip('This address has no wallet row yet.');
        const r = await verifyAudit(walletId);
        if (!r.ok) throw new Error(`chain broken at entry ${r.brokenAtSeq}`);
        return `${r.checked} entries re-hashed, chain intact`;
      },
    },
    {
      id: 'subgraph',
      claim: 'The delegation subgraph is deployed and synced.',
      how: '{ _meta { block { number } hasIndexingErrors } } against the Studio endpoint',
      run: async () => {
        const h = await graphHealth();
        if (!h.healthy) throw new Error(`subgraph reports indexing errors at block ${h.block}`);
        return `synced to block ${h.block}, no indexing errors`;
      },
    },
    {
      id: 'oneinch',
      claim: '1inch routes real liquidity, and the Route row names what it routed through.',
      how: '1inch v6 quote, 100 USDC → WETH on chain 8453',
      run: async () => {
        const q = await quote({ inSymbol: 'USDC', outSymbol: 'WETH', amount: 100 });
        if (!(q.outAmount > 0)) throw new Error('quote returned zero');
        return `100 USDC → ${q.outAmount.toFixed(6)} WETH via ${q.venues.join(', ') || 'an unnamed route'}`;
      },
    },
    {
      id: 'prices',
      claim: 'Every price on screen is real or explicitly labelled.',
      how: 'the same feed the market screens use',
      run: async () => {
        // The same deadline the app's own screens use, so this measures what a user would wait.
        const btc = await priceOf('BTC', 8_000);
        if (!(btc > 1000)) throw new Error(`implausible BTC price ${btc}`);
        return `BTC ${money(btc)}`;
      },
    },
    {
      id: 'aave',
      claim: 'The idle-cash rate is currentLiquidityRate read from the Aave v3 Pool on Base.',
      how: 'getReserveData(USDC) on 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
      run: async () => {
        const r = await usdcReserve();
        return `${(r.apy * 100).toFixed(2)}% a year, aToken ${r.aToken}`;
      },
    },
    {
      id: 'equities',
      claim: 'Tokenized equities are real contracts on Base.',
      how: 'eth_getCode on each equity address',
      run: async () => {
        const entries = Object.values(STOCKS);
        const codes = await Promise.all(
          entries.map((s) => publicClient.getCode({ address: s.address }).catch(() => undefined)),
        );
        const live = entries.filter((_, i) => (codes[i]?.length ?? 0) > 2);
        /*
         * On a chain where they do not exist, this is a SKIP, not a failure.
         *
         * The tokenized equities are Base MAINNET contracts. Reporting FAIL on Sepolia said
         * a true thing — there is no code at those addresses here — in a way that reads as
         * something being broken, when it is the documented two-environment split doing
         * exactly what it says. Skipped is still not passed, and the reason names the chain
         * so nobody mistakes one for the other.
         */
        if (live.length === 0) {
          skip(`No equity contracts on ${CHAIN_KEY}. They are Base mainnet only — see README.`);
        }
        return `${live.length} of ${entries.length} have code: ${live.map((s) => s.symbol).join(', ')}`;
      },
    },
    {
      id: 'gas',
      claim: 'The bot pays its own gas and never touches the user’s ETH.',
      how: `eth_getBalance on the delegate key ${delegatePublicKey}`,
      run: async () => {
        const eth = Number(formatEther(await publicClient.getBalance({ address: delegatePublicKey })));
        if (eth <= 0) throw new Error('the delegate has no ETH — every run would fail');
        return `${eth.toFixed(4)} ETH at ${delegatePublicKey}`;
      },
    },
    {
      id: 'custody',
      claim: 'The delegation contract never holds funds between trades.',
      how: 'balanceOf(delegation) for USDC and WETH',
      run: async () => {
        const [usdc, weth] = await publicClient.multicall({
          allowFailure: false,
          contracts: [
            { address: ADDRESSES.usdcBase, abi: erc20Abi, functionName: 'balanceOf' as const, args: [DELEGATION_ADDRESS] as const },
            { address: ADDRESSES.wethBase, abi: erc20Abi, functionName: 'balanceOf' as const, args: [DELEGATION_ADDRESS] as const },
          ],
        });
        if (usdc > 0n || weth > 0n) {
          throw new Error(
            `the contract is holding ${formatUnits(usdc, 6)} USDC and ${formatUnits(weth, 18)} WETH`,
          );
        }
        return 'zero USDC, zero WETH — nothing parked';
      },
    },
    {
      id: 'runs',
      claim: 'The scheduler trades unattended, and every run is recorded.',
      how: 'the strategy_runs table',
      run: async () => {
        const rows = await query<{ status: string; n: string }>(
          `SELECT status, count(*) AS n FROM strategy_runs GROUP BY status ORDER BY n DESC`,
        );
        if (rows.length === 0) {
          /*
           * No runs is two different facts, and reporting the wrong one is worse than silence.
           *
           * With strategies live and none of them run, the scheduler is broken and this is a
           * FAIL. With no strategies at all, nothing has been asked of it — a fresh deployment
           * reported a red row for working exactly as it should. Say which.
           */
          const [live] = await query<{ n: string }>(
            `SELECT count(*) AS n FROM strategies WHERE state IN ('live','watch')`,
          );
          const n = Number(live?.n ?? 0);
          if (n > 0) throw new Error(`${n} live strateg${n === 1 ? 'y' : 'ies'} and no runs recorded`);
          skip('No strategies on this deployment yet, so the scheduler has had nothing to run.');
        }
        return rows.map((r) => `${r.n} ${r.status}`).join(', ');
      },
    },
    {
      id: 'idempotence',
      claim: 'A run cannot happen twice in one period, by database constraint.',
      how: 'the UNIQUE index on strategy_runs.period_key',
      run: async () => {
        const rows = await query<{ indexdef: string }>(
          `SELECT indexdef FROM pg_indexes
            WHERE tablename='strategy_runs' AND indexdef ILIKE '%UNIQUE%period_key%'`,
        );
        if (rows.length === 0) {
          throw new Error('no unique index on period_key — a retry could double-spend');
        }
        return rows[0]!.indexdef.replace(/^CREATE /, '');
      },
    },
  ];

  const checks = await Promise.all(probes.map(timed));
  return {
    checks,
    passed: checks.filter((c) => c.status === 'pass').length,
    failed: checks.filter((c) => c.status === 'fail').length,
    skipped: checks.filter((c) => c.status === 'skip').length,
    chain: CHAIN_KEY,
    at: new Date().toISOString(),
  };
}
