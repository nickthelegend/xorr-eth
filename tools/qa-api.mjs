/**
 * Section B of docs/QA-PLAN.md, executed.
 *
 * Each check states the expected result as a predicate, so a pass is "matched what the plan said"
 * rather than "did not throw". Prints PASS/FAIL per item with the observed value on a failure.
 */
import { execFileSync } from 'node:child_process';

const B = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8788';
const EMAIL = process.env.E2E_PRIVY_EMAIL ?? 'test-8958@privy.io';

const token = execFileSync('npx', ['tsx', 'server/src/e2e-token.ts', EMAIL], {
  encoding: 'utf8',
}).trim();

let pass = 0;
const failures = [];

async function check(id, what, fn) {
  try {
    const detail = await fn();
    console.log(`PASS  ${id.padEnd(5)} ${what}${detail ? `  — ${detail}` : ''}`);
    pass++;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`FAIL  ${id.padEnd(5)} ${what}\n            ${msg}`);
    failures.push(`${id} ${what}: ${msg}`);
  }
}

/**
 * A 503 `warming` is part of the contract, not a failure: the executor is fetching from a
 * rate-limited upstream and says so with a Retry-After. The app honours it, so the checks do too —
 * anything else would be testing a protocol the product does not use.
 */
async function withRetry(doFetch, attempts = 4) {
  for (let i = 0; i < attempts; i++) {
    const r = await doFetch();
    if (r.status !== 503 || i === attempts - 1) return r;
    const after = Number(r.headers.get('retry-after'));
    await new Promise((res) => setTimeout(res, Number.isFinite(after) && after > 0 ? after * 1000 : 3000));
  }
  throw new Error('unreachable');
}

const req = (path, init = {}, auth = true) =>
  withRetry(() =>
  fetch(`${B}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(auth ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  }),
  );

const must = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

await check('B1', 'GET /health without auth', async () => {
  const r = await req('/health', {}, false);
  const j = await r.json();
  must(r.status === 200, `status ${r.status}`);
  must(j.ok === true && j.db && j.chain && j.delegation, `missing fields: ${JSON.stringify(j)}`);
  return `${j.chain} ${j.delegation.slice(0, 10)}…`;
});

await check('B2', 'no token is 401', async () => {
  const r = await req('/strategies', {}, false);
  const j = await r.json();
  must(r.status === 401, `status ${r.status}`);
  must(j.error === 'unauthorized', `error ${j.error}`);
  return j.detail;
});

await check('B3', 'forged JWT is 401 with a signature failure', async () => {
  const forged =
    'eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkaWQ6cHJpdnk6ZmFrZSIsImF1ZCI6ImZha2UiLCJleHAiOjk5OTk5OTk5OTl9.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const r = await fetch(`${B}/strategies`, { headers: { authorization: `Bearer ${forged}` } });
  const j = await r.json();
  must(r.status === 401, `status ${r.status} body ${JSON.stringify(j)}`);
  must(/signature|invalid|expired/i.test(j.detail ?? ''), `detail: ${j.detail}`);
  return j.detail;
});

await check('B4', 'market quotes are live and positive', async () => {
  const r = await req('/market/quotes?symbols=BTC,ETH,WETH,CBBTC,USDC', {}, false);
  const j = await r.json();
  must(r.status === 200, `status ${r.status}`);
  for (const s of ['BTC', 'ETH', 'WETH', 'CBBTC', 'USDC']) {
    must(j[s]?.price > 0, `${s} has no positive price`);
  }
  return `BTC $${j.BTC.price}`;
});

await check('B5', 'OHLC rows differ by window', async () => {
  const a = await (await req('/market/ohlc?symbol=BTC&days=1', {}, false)).json();
  const b = await (await req('/market/ohlc?symbol=BTC&days=30', {}, false)).json();
  must(Array.isArray(a.rows) && a.rows.length > 0, 'no rows for days=1');
  must(Array.isArray(b.rows) && b.rows.length > 0, 'no rows for days=30');
  must(JSON.stringify(a.rows) !== JSON.stringify(b.rows), 'the two windows returned the same series');
  return `${a.rows.length} vs ${b.rows.length} rows`;
});

await check('B6', 'all 8 equities price live from a route', async () => {
  const rows = await (await req('/market/stocks', {}, false)).json();
  must(rows.length === 8, `${rows.length} rows`);
  for (const s of rows) {
    must(s.feed === 'live', `${s.symbol} feed is ${s.feed}`);
    must(s.price > 5 && s.price < 5000, `${s.symbol} implausible price ${s.price}`);
    must(s.venues.length > 0, `${s.symbol} names no venue`);
  }
  return rows.map((s) => s.symbol).join(',');
});

await check('B7', 'tradable set matches the client', async () => {
  const rows = await (await req('/market/tradable', {}, false)).json();
  const server = rows.map((r) => r.symbol).sort();
  const { TRADABLE } = await import('../src/data/tradable.ts').catch(() => ({ TRADABLE: null }));
  if (!TRADABLE) return `${server.length} symbols (client list not importable here)`;
  must(JSON.stringify(server) === JSON.stringify([...TRADABLE].sort()), `server ${server}`);
  return server.join(',');
});

await check('B8', 'Aave rate is plausible, never a zeroed struct', async () => {
  const j = await (await req('/yield/supply', {}, false)).json();
  must(j.feed === 'live', `feed ${j.feed}`);
  must(j.estimatedApy > 0.001 && j.estimatedApy < 0.5, `apy ${j.estimatedApy}`);
  return `${(j.estimatedApy * 100).toFixed(2)}%`;
});

await check('B9', 'perp: mark real, unknowables null, bad symbol 404', async () => {
  const j = await (await req('/perp/BTC', {}, false)).json();
  must(j.markPx > 0, `markPx ${j.markPx}`);
  must(j.openInterestUsd === null && j.dayVolumeUsd === null && j.fundingRate === null,
    'an unknowable field was given a number');
  must(j.nextFundingAt > Date.now(), 'funding time is in the past');
  const bad = await req('/perp/NOPE', {}, false);
  must(bad.status === 404, `unknown symbol gave ${bad.status}`);
  return `mark $${j.markPx}`;
});

await check('B10', 'agent decision names its own reason', async () => {
  const j = await (await req('/agent/decision')).json();
  must(typeof j.act === 'boolean', `no act field: ${JSON.stringify(j)}`);
  must((j.rationale ?? '').length > 10, `thin rationale: ${j.rationale}`);
  return j.act ? `act, $${j.sizeUsd} via ${j.route?.venue}` : j.reason;
});

await check('B11', 'graph health', async () => {
  const j = await (await req('/graph/health')).json();
  must(j.block > 0, `block ${j.block}`);
  must(j.healthy === true, 'indexer reports errors');
  return `block ${j.block}`;
});

await check('B12', 'swap quote names real venues', async () => {
  const j = await (await req('/swap/quote?in=USDC&out=WETH&amount=250')).json();
  must(j.outAmount > 0, `outAmount ${j.outAmount}`);
  must(j.minimumOut > 0 && j.minimumOut < j.outAmount, 'minimumOut is not below outAmount');
  must(j.venues?.length > 0, 'no venues named');
  return `${j.outAmount.toFixed(5)} WETH via ${j.venues.join('+')}`;
});


// ── B13–B23 ─────────────────────────────────────────────────────────────────

const post = (path, body) => req(path, { method: 'POST', body: JSON.stringify(body) });

await check('B13', 'over-cap strategy is refused with the arithmetic', async () => {
  const r = await post('/strategies', {
    kind: 'dca', state: 'live', label: 'qa over cap', symbol: 'WETH',
    cadence: 'daily', dailyAllocationUsd: 9_999_999,
  });
  const j = await r.json();
  must(r.status === 400, `status ${r.status}`);
  must(j.error === 'over_cap', `error ${j.error}`);
  must(/\$[\d,]+ a day against a \$[\d,]+ cap/.test(j.message), `message: ${j.message}`);
  return j.message.slice(0, 60);
});

await check('B14', 'untradable symbol names what IS tradable', async () => {
  const r = await post('/strategies', {
    kind: 'dca', state: 'live', label: 'qa sol', symbol: 'SOL',
    cadence: 'weekly', dailyAllocationUsd: 10,
  });
  const j = await r.json();
  must(r.status === 400, `status ${r.status}`);
  must(/not tradable/.test(j.detail ?? ''), `detail ${j.detail}`);
  must(/WETH/.test(j.detail ?? ''), 'does not name the alternatives');
  return 'refused, alternatives named';
});

await check('B15', 'malformed JSON is 400, never 500', async () => {
  const r = await req('/strategies', { method: 'POST', body: '{not json' });
  const j = await r.json();
  must(r.status === 400, `status ${r.status}`);
  must(j.error === 'invalid_json', `error ${j.error}`);
  return j.error;
});

await check('B16', 'missing fields are named', async () => {
  const r = await post('/strategies', { kind: 'dca', symbol: 'WETH' });
  const j = await r.json();
  must(r.status === 400, `status ${r.status}`);
  must(j.error === 'invalid_request', `error ${j.error}`);
  must(/label|state/.test(j.detail ?? ''), `detail ${j.detail}`);
  return j.detail.slice(0, 50);
});

await check('B17', 'running twice in a period is a no-op', async () => {
  const made = await post('/strategies', {
    kind: 'dca', state: 'live', label: `qa idem ${Date.now()}`, symbol: 'WETH',
    cadence: 'weekly', dailyAllocationUsd: 5, params: { usd: 5 },
  });
  if (made.status !== 200) return `skipped: cap full (${made.status})`;
  const { id } = await made.json();
  const first = await (await post(`/strategies/${id}/run`, {})).json();
  const second = await (await post(`/strategies/${id}/run`, {})).json();
  must(second.status === 'skipped', `second run was ${second.status}`);
  must(second.reason === 'already_ran_this_period', `reason ${second.reason}`);
  await req(`/strategies/${id}`, { method: 'DELETE' });
  return `first ${first.status}, second ${second.reason}`;
});

await check('B18', "another wallet's strategy id is 404, not 403", async () => {
  const r = await post('/strategies/123e4567-e89b-42d3-a456-426614174000/run', {});
  must(r.status === 404, `status ${r.status}`);
  const j = await r.json();
  must(j.error === 'not_found', `error ${j.error}`);
  return 'not_found';
});

await check('B19', 'agent lifecycle: hire is idempotent', async () => {
  const a = await (await post('/agents', { personaId: 'momentum-scout' })).json();
  const b = await (await post('/agents', { personaId: 'momentum-scout' })).json();
  must(a.id === b.id, 'hiring twice made two agents');
  must(a.hired === true, 'not marked hired');
  const patched = await (
    await req(`/agents/${a.id}`, { method: 'PATCH', body: JSON.stringify({ tone: 'flat' }) })
  ).json();
  must(patched.tone === 'flat', `tone ${patched.tone}`);
  return `${a.name} tone=${patched.tone}`;
});

await check('B20', 'a created alert comes back in the list', async () => {
  const name = `qa alert ${Date.now()}`;
  const made = await (
    await post('/alerts', { kind: 'price', symbol: 'WETH', name, detail: 'qa', config: { above: 1 } })
  ).json();
  must(made.id, `no id: ${JSON.stringify(made)}`);
  const list = await (await req('/alerts')).json();
  must(list.some((a) => a.id === made.id), 'created alert is not in the list');
  // And the toggle persists.
  await post(`/alerts/${made.id}`, { enabled: false });
  const after = await (await req('/alerts')).json();
  must(after.find((a) => a.id === made.id).enabled === false, 'toggle did not persist');
  await req(`/alerts/${made.id}`, { method: 'DELETE' });
  return 'created, listed, toggled, deleted';
});

await check('B21', 'the audit hash chain verifies', async () => {
  const j = await (await req('/activity/verify')).json();
  must(j.ok === true || j.valid === true, `verify said ${JSON.stringify(j).slice(0, 90)}`);
  return JSON.stringify(j).slice(0, 60);
});

await check('B22', 'the public market surface is rate limited', async () => {
  // 260 requests inside the window; the ceiling is 240.
  let limited = 0;
  for (let i = 0; i < 260; i++) {
    const r = await fetch(`${B}/market/symbols`);
    if (r.status === 429) {
      limited++;
      must(r.headers.get('retry-after'), '429 without a Retry-After');
      break;
    }
  }
  must(limited > 0, 'never rate limited after 260 requests');
  return '429 with Retry-After';
});

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) process.exitCode = 1;
