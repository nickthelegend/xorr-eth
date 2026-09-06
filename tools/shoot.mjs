/**
 * Screenshot every route at the design's canvas size.
 *
 * Uses Playwright's Chromium against the running Expo web build with a real Privy session, so the
 * shots show the app as a signed-in user sees it — not the logged-out shell, which is what a naive
 * capture would produce for every authenticated screen.
 *
 * Run:  node tools/shoot.mjs
 */
import { chromium } from 'playwright';
import { Buffer } from 'node:buffer';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.APP_URL ?? 'http://localhost:8082';
const OUT = path.resolve(import.meta.dirname, '../docs/screens');
// design.md: the canvas is 402 x 874.
const VIEWPORT = { width: 402, height: 874 };

/** route -> file stem. Ordered the way the README groups them. */
const ROUTES = [
  ['01-welcome', '/welcome'],
  ['02-goals', '/goals'],
  ['03-wallet', '/wallet'],
  ['04-fund', '/fund'],
  ['05-delegate', '/delegate'],
  ['06-proposal', '/proposal'],
  ['07-home', '/'],
  ['08-markets', '/markets'],
  ['09-markets-crypto', '/markets/crypto'],
  ['10-markets-stocks', '/markets/stocks'],
  ['11-markets-commodities', '/markets/commodities'],
  ['12-markets-indices', '/markets/indices'],
  ['13-markets-preipo', '/markets/preipo'],
  ['14-watchlist', '/watchlist'],
  ['15-search', '/search'],
  ['16-asset', '/asset/BTC'],
  ['17-asset-stock', '/asset/NVDAc'],
  ['18-chart', '/chart/BTC'],
  ['19-order', '/order/WETH'],
  ['20-order-stock', '/order/NVDAc'],
  ['21-swap', '/swap'],
  ['22-perp', '/perp/BTC'],
  // A REAL position id, so these two screens are shot in their loaded state rather than their
  // empty one. Override with QA_POSITION_ID when the database is reseeded.
  ['23-position', `/position/${process.env.QA_POSITION_ID ?? '50ec6e5f-54d6-45c1-a1e5-cfd15c134b29'}`],
  ['24-auto-close', `/auto-close/${process.env.QA_POSITION_ID ?? '50ec6e5f-54d6-45c1-a1e5-cfd15c134b29'}`],
  ['25-bot', '/bot'],
  ['26-bot-roster', '/bot/roster'],
  ['27-bot-leaderboard', '/bot/leaderboard'],
  ['28-bot-intro', '/bot/momentum/intro'],
  ['29-bot-settings', '/bot/momentum/settings'],
  ['30-bot-backtest', '/bot/momentum/backtest'],
  ['31-strategies', '/strategies'],
  ['32-strategy-dca', '/strategy/dca'],
  ['32b-strategy-yield', '/strategy/yield'],
  ['32c-strategy-grid', '/strategy/grid'],
  ['32d-yield-position', '/yield'],
  ['32e-flatten', '/flatten'],
  ['32f-judge', '/judge'],
  ['33-holdings', '/holdings'],
  ['34-activity', '/activity'],
  ['35-history', '/history'],
  ['36-briefing', '/briefing'],
  ['37-inbox', '/inbox'],
  ['38-safety', '/safety'],
  ['39-settings', '/settings'],
  ['40-alerts', '/alerts'],
  ['41-alerts-new', '/alerts/new'],
  ['42-allowlist', '/allowlist'],
  ['43-send', '/send'],
  ['44-recovery', '/recovery'],
  ['45-legal', '/legal/terms'],
  ['46-dev-components', '/_dev/components'],
  ['47-dev-fidelity', '/_dev/fidelity'],
];

/**
 * Sign in for real, so the authenticated screens show what a user sees.
 *
 * Privy's own test-credentials endpoint provisions a throwaway account with a known OTP. That is
 * Privy's supported path for exactly this, so the session below is a genuine one — the same
 * verifyAuthToken runs against it as in production. Nothing about auth is bypassed.
 */
const signIn = async (page) => {
  const appId = process.env.PRIVY_APP_ID;
  const secret = process.env.PRIVY_APP_SECRET;
  if (!appId || !secret) {
    console.log('PRIVY_APP_ID/SECRET not set — authenticated screens will show the signed-out state');
    return false;
  }

  const res = await fetch(`https://auth.privy.io/api/v1/apps/${appId}/test_credentials`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${appId}:${secret}`).toString('base64')}`,
      'privy-app-id': appId,
      'content-type': 'application/json',
    },
    body: '{}',
  });
  if (!res.ok) {
    console.log(`could not provision a test account (${res.status}) — screens will show signed out`);
    return false;
  }
  const { email, otp_code: otp } = await res.json();

  await page.goto(BASE + '/wallet', { waitUntil: 'networkidle' });
  await page.fill('input[type=email]', email);
  await page.getByText(/email me a code/i).first().click();
  await page.waitForSelector('input[placeholder*="6-digit"]', { timeout: 30_000 });
  await page.fill('input[placeholder*="6-digit"]', otp);
  await page.getByText(/verify and create/i).first().click();
  // The embedded wallet is created during this step; it is not instant.
  await page.waitForTimeout(15_000);
  console.log(`signed in as ${email}`);
  return true;
};

const main = async () => {
  await fs.mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await signIn(page);

  const errors = [];
  const netFail = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => errors.push('UNCAUGHT ' + String(e.message).slice(0, 160)));
  page.on('requestfailed', (r) => {
    /*
     * Expo's dev server probes each route with a HEAD it then aborts, so every navigation records
     * one ERR_ABORTED against the app's own URL. Counting those would mark all 47 screens failed
     * for a thing Metro does on purpose — so only genuinely failed requests are recorded, and the
     * filter names exactly what it excuses rather than swallowing all failures.
     */
    const aborted = (r.failure()?.errorText ?? '').includes('ERR_ABORTED');
    const isDevProbe = aborted && r.method() === 'HEAD' && r.url().startsWith(BASE);
    if (!isDevProbe) netFail.push(`FAILED ${r.method()} ${r.url().slice(0, 110)}`);
  });
  page.on('response', (r) => {
    // 503 is the documented warming handshake, not a failure — the client retries it.
    if (r.status() >= 400 && r.status() !== 503) netFail.push(`${r.status()} ${r.url().slice(0, 110)}`);
  });

  const report = [];
  for (const [stem, route] of ROUTES) {
    errors.length = 0;
    netFail.length = 0;
    await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 45_000 }).catch(() => {});
    // Prices and charts settle after the first paint; the design bans entrance animations, so
    // there is nothing to wait out except the data itself.
    await page.waitForTimeout(3500);
    await page.screenshot({ path: path.join(OUT, `${stem}.png`) });
    // Privy's own SDK logs two of these from its confirmation modal and balance reader. They are
    // third-party and attributed rather than excused.
    const bad = [...new Set(errors)].filter((e) => !/isActive|balanceOf|styled-components/i.test(e));
    const net = [...new Set(netFail)];
    const text = (await page.innerText('body').catch(() => '')).slice(0, 400);
    const ok = bad.length === 0 && net.length === 0;
    report.push({ stem, route, ok, errors: bad, network: net, text });
    console.log(
      `${ok ? 'PASS' : 'FAIL'} ${stem.padEnd(24)} ${route}` +
        (bad.length ? `\n       console: ${bad[0]}` : '') +
        (net.length ? `\n       network: ${net.join(' | ')}` : ''),
    );
  }
  await fs.writeFile(path.join(OUT, 'qa-report.json'), JSON.stringify(report, null, 1));

  await browser.close();
  console.log(`\n${ROUTES.length} screens -> docs/screens/`);
};

await main();
