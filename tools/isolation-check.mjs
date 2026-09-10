/**
 * E12 and E14 — two things a signed-in browser cannot check about itself.
 *
 * E12, cross-tenant isolation: a SECOND real Privy account must see none of the first's data. Run
 * from one session it is untestable, because the only session available is the one that owns the
 * data. So this signs in as a different account in a clean context and compares.
 *
 * E14, the signed-out state: an authenticated screen with no session must SAY it needs one.
 * Rendering an empty balance and an empty list is the failure mode — a screen that shows "$0.00"
 * to a signed-out visitor is stating a fact about a wallet it has not looked at.
 *
 * Run: node tools/isolation-check.mjs
 */
import { chromium } from 'playwright';

try { process.loadEnvFile(new URL('../.env', import.meta.url)); } catch {}

const APP = process.env.APP_URL ?? 'https://web-production-3e214.up.railway.app';
const API = process.env.EXPO_PUBLIC_API_URL ?? 'https://executor-production-1659.up.railway.app';
const appId = process.env.PRIVY_APP_ID;
const secret = process.env.PRIVY_APP_SECRET;
const auth = {
  authorization: `Basic ${Buffer.from(`${appId}:${secret}`).toString('base64')}`,
  'privy-app-id': appId,
  'content-type': 'application/json',
};

const listed = await fetch(`https://auth.privy.io/api/v1/apps/${appId}/test_credentials`, { headers: auth });
const accounts = (await listed.json()).data ?? [];
const primaryEmail = process.env.E2E_PRIVY_EMAIL ?? 'test-8958@privy.io';
const other = accounts.find((a) => a.email !== primaryEmail);
if (!other) throw new Error('needs a second Privy test credential and there is only one');

let pass = 0, fail = 0;
const check = (id, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${detail}`); ok ? pass++ : fail++; };

const browser = await chromium.launch();

// ── E14 — a clean context, never signed in ─────────────────────────────────
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  const results = [];
  for (const route of ['/', '/limits', '/strategies', '/activity', '/safety']) {
    await page.goto(APP + route, { waitUntil: 'networkidle', timeout: 45_000 }).catch(() => {});
    await page.waitForTimeout(6000);
    const text = (await page.innerText('body').catch(() => '')).replace(/\s+/g, ' ');
    // Correct: it asks you to sign in, or states that it cannot know. Not: an empty figure as fact.
    const asksForSignIn = /sign in|signed out|connect|get started|create your wallet|need.*wallet/i.test(text);
    results.push({ route, asksForSignIn, sample: text.slice(0, 110) });
  }
  for (const r of results) check('E14', r.asksForSignIn, `${r.route.padEnd(12)} ${r.sample}`);
  const bad = [...new Set(errors)].filter((e) => !/isActive|balanceOf|styled-components/i.test(e));
  check('E14', bad.length === 0, `console on signed-out screens: ${bad.length} error(s) ${bad[0] ?? ''}`);
  await ctx.close();
}

// ── E12 — a second real account, clean context ─────────────────────────────
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(APP + '/wallet', { waitUntil: 'networkidle' });
  await page.fill('input[type=email]', other.email);
  await page.getByText(/email me a code/i).first().click();
  await page.waitForSelector('input[placeholder*="6-digit"]', { timeout: 30_000 });
  await page.fill('input[placeholder*="6-digit"]', other.otp_code);
  await page.getByText(/verify and create/i).first().click();
  await page.waitForTimeout(18_000);

  const token = await page.evaluate(() => localStorage.getItem('privy:token'));
  if (!token) throw new Error(`sign-in failed for ${other.email}`);
  const addr = await page.evaluate(() => {
    const m = (localStorage.getItem('xorr-store') ?? '').match(/0x[0-9a-fA-F]{40}/);
    return m ? m[0] : null;
  });
  console.log(`\n  second account ${other.email} -> ${addr}`);

  const as = async (path) => {
    const r = await fetch(API + path, { headers: { authorization: `Bearer ${token.replace(/^"|"$/g, '')}` } });
    return { s: r.status, j: await r.json().catch(() => null) };
  };

  const wallet = await as('/wallet');
  check('E12', wallet.j?.address && wallet.j.address.toLowerCase() !== '0x95a0b368588713011a15f4b1041423f31b08e615',
    `its own wallet ${wallet.j?.address}, not the first account's`);

  const strategies = await as('/strategies');
  const leaked = (strategies.j ?? []).filter((s) =>
    /UTC stamp check|anchor append-only probe|\$50 of WETH, weekly|\$5 of WETH, weekly/.test(s.label ?? ''));
  check('E12', leaked.length === 0, `sees ${(strategies.j ?? []).length} strategies, ${leaked.length} belonging to the first account`);

  const activity = await as('/activity?limit=50');
  const rows = Array.isArray(activity.j) ? activity.j : (activity.j?.entries ?? []);
  const leakedTrail = rows.filter((r) => /UTC stamp check|anchor append-only probe/.test(r.action ?? ''));
  check('E12', leakedTrail.length === 0, `sees ${rows.length} trail rows, ${leakedTrail.length} belonging to the first account`);

  const limits = await as('/limits');
  check('E12', limits.s === 200 && limits.j?.dailyCapUsd !== 1600,
    `its own limits (cap ${limits.j?.dailyCapUsd}), not the first account's $1,600`);

  await ctx.close();
}

await browser.close();
console.log(`\nE12/E14: ${pass} pass, ${fail} fail`);
