/**
 * Grant a delegation for the E2E test wallet, through the real UI, signed by its own owner.
 *
 * WHY THIS EXISTS
 *
 * `agents.live.test.ts` and `decide.live.test.ts` need a wallet the chain currently PERMITS. A
 * grant is signed by the wallet's owner and nothing else can produce one — that is the entire
 * safety story of this project and it is not negotiable, so the server cannot mint one for a test.
 * Without a grant those suites either failed on a correct refusal or, worse, returned early and
 * reported PASS without testing anything.
 *
 * So it is done the way a user does it: sign in, open the permission screen, press the button, let
 * Privy's embedded wallet sign — then read the chain back to confirm. Base Sepolia, so the only
 * thing spent is testnet gas.
 *
 * Run: node tools/grant-test-wallet.mjs
 */
import { chromium } from 'playwright';

try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch {
  // No `.env` is legitimate; the precondition checks below report what they could not do.
}

const BASE = process.env.APP_URL ?? 'https://web-production-3e214.up.railway.app';
const RPC = process.env.BASE_SEPOLIA_RPC ?? 'https://sepolia.base.org';
const DELEGATION = '0xb14CF3D0b5269aCDE52322218adb6d5C1daE0a4e';
const appId = process.env.PRIVY_APP_ID;
const secret = process.env.PRIVY_APP_SECRET;
if (!appId || !secret) throw new Error('PRIVY_APP_ID/PRIVY_APP_SECRET are required');

const auth = {
  authorization: `Basic ${Buffer.from(`${appId}:${secret}`).toString('base64')}`,
  'privy-app-id': appId,
  'content-type': 'application/json',
};

const listed = await fetch(`https://auth.privy.io/api/v1/apps/${appId}/test_credentials`, { headers: auth });
if (!listed.ok) throw new Error(`could not list test credentials (${listed.status})`);
const existing = (await listed.json()).data ?? [];
const preferred = process.env.E2E_PRIVY_EMAIL ?? 'test-8958@privy.io';
const account = existing.find((a) => a.email === preferred);
if (!account) throw new Error(`no test credential for ${preferred}`);
const { email, otp_code: otp } = account;

/** `policyOf(owner)` read straight from the contract, so the result is the chain's word, not ours. */
const policyOnChain = async (owner) => {
  const selector = '0x8f0d2f1e';
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to: DELEGATION, data: `${selector}${owner.slice(2).toLowerCase().padStart(64, '0')}` }, 'latest'],
    }),
  }).then((r) => r.json());
  return res.result;
};

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') console.log('  [console]', m.text().slice(0, 160));
});

await page.goto(`${BASE}/wallet`, { waitUntil: 'networkidle' });
await page.fill('input[type=email]', email);
await page.getByText(/email me a code/i).first().click();
await page.waitForSelector('input[placeholder*="6-digit"]', { timeout: 30_000 });
await page.fill('input[placeholder*="6-digit"]', otp);
await page.getByText(/verify and create/i).first().click();
await page.waitForTimeout(15_000);

const token = await page.evaluate(() => localStorage.getItem('privy:token'));
if (!token) throw new Error(`sign-in failed for ${email} — no Privy token in storage`);
const owner = await page.evaluate(() => {
  const m = (localStorage.getItem('xorr-store') ?? '').match(/0x[0-9a-fA-F]{40}/);
  return m ? m[0] : null;
});
console.log(`signed in as ${email} -> ${owner}`);
console.log('policy before:', await policyOnChain(owner));

await page.goto(`${BASE}/delegate`, { waitUntil: 'networkidle' });
await page.waitForTimeout(6000);
console.log('screen:', (await page.innerText('body')).replace(/\s+/g, ' ').slice(0, 260));

const sign = page.getByText(/sign this permission/i).first();
if (!(await sign.count())) throw new Error('no "Sign this permission" control on /delegate');
await sign.click();
console.log('pressed sign — waiting for the signature and the transaction');

for (let i = 0; i < 12; i += 1) {
  await page.waitForTimeout(10_000);
  const t = (await page.innerText('body')).replace(/\s+/g, ' ');
  console.log(`  t+${(i + 1) * 10}s: ${t.slice(0, 200)}`);
  if (/granted|permission is live|take it back|expires/i.test(t)) break;
}

await page.screenshot({ path: 'docs/screens/grant-test-wallet.png' });
console.log('policy after: ', await policyOnChain(owner));
await browser.close();
