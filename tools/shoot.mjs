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
import { execFileSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.APP_URL ?? 'http://localhost:8082';
const API = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8788';
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
  // Filled in at runtime from the signed-in account's own roster — see `resolveIds`. Agents are
  // per-wallet rows, so a hardcoded id belongs to somebody else and these screens were being shot
  // in their not-found state.
  ['28-bot-intro', 'AGENT:/bot/{id}/intro'],
  ['29-bot-settings', 'AGENT:/bot/{id}/settings'],
  ['30-bot-backtest', 'AGENT:/bot/{id}/backtest'],
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
  // `/_dev/components` was never a route — the design harness lives at `/_dev/ui`, and
  // `/_dev/ui-edge` was not swept at all, so the one screen whose whole job is to render every
  // edge case was the one screen nothing checked.
  ['46-dev-ui', '/_dev/ui'],
  ['46b-dev-ui-edge', '/_dev/ui-edge'],
  ['47-dev-fidelity', '/_dev/fidelity'],
  ['48-dev-boom', '/_dev/boom'],
];


/**
 * What each screen has to actually SAY, from docs/QA-PLAN.md section A.
 *
 * The sweep used to check only the console and the network, which is why `/markets` rendering
 * "0 shown" with no rows passed for weeks: a screen can be completely broken and completely
 * silent. `must` is text that has to appear; `never` is text that must not.
 *
 * These are deliberately about MEANING rather than layout — a price being present, a tag being
 * applied, an empty state offering a next step. Asserting pixel copy would break on every wording
 * change and teach whoever hits it to delete the assertion.
 */
const EXPECT = {
  '01-welcome': { must: [/XORR/, /Get started/], never: [/Total value/i] },
  '02-goals': { must: [/optimise for/i, /Grow long term/, /Steady/, /Balanced/, /Aggressive/, /selected/] },
  '03-wallet': { must: [/Your wallet, your keys/, /Signed in/, /Wallet created/, /Network ready/] },
  '04-fund': { must: [/Fund the wallet/, /USDC on Base/, /SEND USDC TO/, /0x[0-9a-fA-F]{40}/], never: [/USDT or SOL/, /^Deposit \$/m] },
  '05-delegate': { must: [/It can place trades/, /cannot move your money out/, /expires on its own/, /\$[\d,]+/] },
  '06-proposal': { must: [/draft portfolio/, /100%/, /Aave v3/], never: [/Staked SOL/, /NVDAx/] },
  '07-home': { must: [/TOTAL VALUE/, /\$[\d,]+\.\d\d/, /Available to trade/, /Aave/] },
  '08-markets': { must: [/Crypto/, /Stocks/, /Commodities/, /\d+ shown/], never: [/^0 shown/m] },
  '09-markets-crypto': { must: [/\$[\d,]+/, /markets/] },
  '10-markets-stocks': { must: [/\$[\d,]+/] },
  '11-markets-commodities': { must: [/SIMULATED/, /9 of 9/] },
  '12-markets-indices': { must: [/SIMULATED/] },
  '13-markets-preipo': { must: [/SIMULATED/] },
  '14-watchlist': { must: [/\$[\d,]+/] },
  '15-search': { must: [/Search/i] },
  // The asset screen headlines the instrument's NAME, not its ticker — "Bitcoin", not "BTC".
  '16-asset': { must: [/Bitcoin|BTC/, /\$[\d,]+/, /Your position/] },
  '17-asset-stock': { must: [/Nvidia|NVDA/, /\$[\d,]+/, /No price history/] },
  '18-chart': { must: [/\$[\d,]+/, /15m/, /1H/, /1D/] },
  '19-order': { must: [/WETH/] },
  '20-order-stock': { must: [/NVDA/] },
  '21-swap': { must: [/Swap|swap/] },
  '22-perp': { must: [/BTC/] },
  '23-position': { must: [/Entry|entry|position/i] },
  '24-auto-close': { must: [/Take profit|Stop|stop/i] },
  /*
   * The agent's status line, not a fixed string.
   *
   * This asserted /Watching/ — which passed because the screen hardcoded "Watching 14 markets"
   * whenever there was no proposal: a number nothing had counted, in profit-green, under an
   * agent's name. The assertion was pinning the bug in place. What has to be true is that the
   * line says something about the agent's actual state.
   */
  '25-bot': { must: [/No proposal right now|Watching|Proposed|Waiting/] },
  '26-bot-roster': { must: [/Momentum Scout/] },
  '27-bot-leaderboard': { must: [/Momentum Scout|Leaderboard|leaderboard/] },
  // Whichever agent the id names — and never a different one silently substituted.
  '28-bot-intro': { must: [/Momentum Scout|Earnings Desk|Drawdown Guard/], never: [/No such agent/] },
  '29-bot-settings': { must: [/cap|Cap|limit/] },
  '30-bot-backtest': { must: [/Nothing here is a promise|promise/] },
  '31-strategies': { must: [/Strategies/, /Running/, /Add new/] },
  '32-strategy-dca': { must: [/Recurring buy/, /Next three runs/i] },
  '32b-strategy-yield': { must: [/AAVE|Aave/, /%/, /If it ran now/i, /Withdrawing is yours alone/] },
  '32c-strategy-grid': { must: [/Range accumulation/, /\$[\d,]+/, /leaves the range it stops/] },
  '32d-yield-position': { must: [/Aave|lending pool/, /not the bot|never given/] },
  '32e-flatten': { must: [/Sell everything/, /does not use your daily cap/] },
  /*
   * `never: [/FAIL/]` was wrong, and it was wrong in the direction that matters.
   *
   * This wallet's trail forks at entry 2 — two writers claimed one predecessor before `append`
   * took a per-wallet lock. That is real, it is reported, and it is PERMANENT: the trail is
   * append-only by trigger, so it cannot be rewritten to look clean, which is the whole reason
   * anyone should believe it. Asserting the page never says FAIL asks the console to hide a true
   * result, and a console that goes quiet when something is broken is worth nothing.
   *
   * So the assertion is about the claim that would actually be damning: no row has been ALTERED.
   * A fork is visible damage from a fixed bug; an edited record is the thing this whole structure
   * exists to detect, and that one must never appear.
   */
  '32f-judge': { must: [/Check it yourself/, /\d+\/\d+/, /PASS/], never: [/has been altered/] },
  '33-holdings': { must: [/PORTFOLIO VALUE/, /ALLOCATION/, /0x[0-9a-fA-F]{40}/] },
  '34-activity': { must: [/Activity/, /Export audit trail/, /Disposals/] },
  '35-history': { must: [/History|settled|spend/i] },
  '36-briefing': { must: [/Briefing|briefing/] },
  '37-inbox': { must: [/Inbox|inbox|catch up/i] },
  '38-safety': { must: [/Agents are live|Agents are stopped/, /YOUR WALLET/, /THE BOT'S KEY/, /0x[0-9a-fA-F]{40}/, /Stopping is not selling/] },
  '39-settings': { must: [/Settings/] },
  '40-alerts': { must: [/Alerts/, /What the bot tells you/, /Circuit breakers/] },
  /*
   * Not the kind selector — it is gone.
   *
   * This asserted /Price|Agent|Risk/, which passed because the screen offered three kinds and
   * built only one of them: choosing Agent or Risk changed nothing on screen and POSTed an alert
   * the executor could not evaluate. The assertion was holding the broken control in place. What
   * has to be true is that the screen collects a symbol and a level.
   */
  '41-alerts-new': { must: [/New alert/, /SYMBOL/, /ABOVE/] },
  // Either real 0x destinations the user added, or an honest empty state. Never the invented
  // base58 pair the handoff seeded, which were not even addresses on this chain.
  '42-allowlist': { must: [/Allowlist/], never: [/[13-9A-HJ-NP-Za-km-z]{40,}/] },
  '43-send': { must: [/allowlist/i] },
  '44-recovery': { must: [/Recovery|recovery|backed up/] },
  '45-legal': { must: [/Terms|terms/] },
  '46-dev-ui': { must: [/Design system/] },
  '46b-dev-ui-edge': { must: [/Edge cases/] },
  '47-dev-fidelity': { must: [/Fidelity|fidelity/i] },
  '48-dev-boom': { must: [/Break this screen/, /Throw during render/] },
};

/** Which expectations a screen's text failed. Empty means it said everything it had to. */
function contentFailures(stem, text) {
  const e = EXPECT[stem];
  if (!e) return [`no expectation defined for ${stem} — every route needs one`];
  const out = [];
  for (const re of e.must ?? []) if (!re.test(text)) out.push(`missing ${re}`);
  for (const re of e.never ?? []) if (re.test(text)) out.push(`must not contain ${re}`);
  return out;
}

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

  const auth = {
    authorization: `Basic ${Buffer.from(`${appId}:${secret}`).toString('base64')}`,
    'privy-app-id': appId,
    'content-type': 'application/json',
  };

  /*
   * Reuse a test account rather than minting one every run.
   *
   * Privy caps an app at twenty test accounts, and creating one per sweep hit that ceiling — after
   * which every run signed in as nobody and shot fifty-three screens in their signed-out state
   * while reporting them as content failures. A sweep that consumes a finite quota to run is a
   * sweep that stops working.
   *
   * Reusing one is also better than a fresh account: it accumulates a wallet, a permission,
   * positions and history, so the screens are exercised loaded rather than empty. The preferred
   * account is the one the executor's own end-to-end tooling uses, so both look at the same wallet.
   */
  const listed = await fetch(`https://auth.privy.io/api/v1/apps/${appId}/test_credentials`, {
    headers: auth,
  });
  const existing = listed.ok ? ((await listed.json()).data ?? []) : [];
  const preferred = process.env.E2E_PRIVY_EMAIL ?? 'test-8958@privy.io';
  let account = existing.find((a) => a.email === preferred) ?? existing[0];

  if (!account) {
    const made = await fetch(`https://auth.privy.io/api/v1/apps/${appId}/test_credentials`, {
      method: 'POST',
      headers: auth,
      body: '{}',
    });
    if (!made.ok) {
      console.log(`could not provision a test account (${made.status}) — screens will show signed out`);
      return false;
    }
    account = await made.json();
  }
  const { email, otp_code: otp } = account;

  await page.goto(BASE + '/wallet', { waitUntil: 'networkidle' });
  await page.fill('input[type=email]', email);
  await page.getByText(/email me a code/i).first().click();
  await page.waitForSelector('input[placeholder*="6-digit"]', { timeout: 30_000 });
  await page.fill('input[placeholder*="6-digit"]', otp);
  await page.getByText(/verify and create/i).first().click();
  // The embedded wallet is created during this step; it is not instant.
  await page.waitForTimeout(15_000);

  /*
   * Check that it worked, rather than announcing that it did.
   *
   * This printed "signed in as …" unconditionally, so a failed sign-in was reported as a success
   * and fifty-three screens were then shot in their signed-out state and blamed for it. A harness
   * that asserts its own preconditions is the only kind whose failures mean anything.
   */
  const token = await page.evaluate(() => {
    try {
      return localStorage.getItem('privy:token');
    } catch {
      return null;
    }
  });
  if (!token) {
    console.log(`SIGN-IN FAILED for ${email} — no Privy token in storage. Screens will be signed out.`);
    return false;
  }
  console.log(`signed in as ${email}`);
  return true;
};

/**
 * Resolve the ids this account actually owns.
 *
 * Agents and positions are per-wallet rows, so a literal id in the route table belongs to whoever
 * happened to be signed in when it was written. The sweep signs in as a fresh account every run,
 * so it asks that account what it has — the same way a user gets there, by tapping a row.
 */
const resolveIds = async () => {
  /*
   * Asked of the executor in Node, not of the page.
   *
   * Reading the token out of `localStorage` inside `page.evaluate` throws SecurityError depending
   * on the document's origin at that moment, and the answer does not need the browser anyway —
   * it is the same account either way.
   */
  try {
    const email = process.env.E2E_PRIVY_EMAIL ?? 'test-8958@privy.io';
    const token = execFileSync('npx', ['tsx', 'server/src/e2e-token.ts', email], {
      encoding: 'utf8',
    }).trim();
    const res = await fetch(`${API}/agents`, { headers: { authorization: `Bearer ${token}` } });
    const agents = res.ok ? await res.json() : [];
    return { agentId: agents[0]?.id };
  } catch {
    return { agentId: undefined };
  }
};

/**
 * Wait for the executor's boot warm before judging anything.
 *
 * `warmMarketCache` pulls every symbol's chart through a 1.1s-spaced queue, so for about a minute
 * after a restart some charts answer 503 while the entry is still being fetched. That is a real
 * state, handled honestly by the app — and it is not the state a user is in, so measuring it tells
 * you nothing about whether the chart works. Waiting makes the sweep repeatable instead of a race.
 */
const waitForWarm = async () => {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const res = await fetch(`${API}/market/ohlc?symbol=BTC&days=1`).catch(() => undefined);
    if (res?.ok) return true;
    await new Promise((r) => setTimeout(r, 3_000));
  }
  console.log('charts still warming after 120s — shooting anyway, some may show the fetching state');
  return false;
};

const main = async () => {
  await fs.mkdir(OUT, { recursive: true });
  await waitForWarm();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const signedIn = await signIn(page);
  if (!signedIn) {
    // Every authenticated expectation would fail for one reason. Say it once, loudly, and stop.
    console.error('\nAborting: the sweep cannot judge authenticated screens without a session.');
    await browser.close();
    process.exit(1);
  }

  const errors = [];
  const netFail = [];
  /*
   * The two halves have to agree about the warming handshake.
   *
   * The `response` hook below already excuses a 503 — the client retries it and the screen says
   * "Fetching" while it does. But Chrome ALSO writes "Failed to load resource: … 503" to the
   * console for the same response, and that half was counted, so `/asset/BTC` and
   * `/auto-close/:id` failed the sweep for the one thing the sweep had decided was fine. One
   * rule, stated once, applied to both.
   */
  const WARMING = /Failed to load resource.*\b503\b/i;
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text().slice(0, 160);
    if (!WARMING.test(text)) errors.push(text);
  });
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

  const { agentId } = await resolveIds();
  console.log(agentId ? `agent ${agentId}` : 'no agents on this account — agent screens will show not-found');

  const report = [];
  for (const [stem, template] of ROUTES) {
    // `AGENT:` routes are filled in from this account's own roster.
    const route = template.startsWith('AGENT:')
      ? template.slice('AGENT:'.length).replace('{id}', agentId ?? 'none')
      : template;
    errors.length = 0;
    netFail.length = 0;
    await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 45_000 }).catch(() => {});
    /*
     * Prices and charts settle after the first paint; the design bans entrance animations, so
     * there is nothing to wait out except the data itself.
     *
     * Six seconds, not three and a half. A cold load now has an extra round trip on its critical
     * path — the wallet is fetched from the executor rather than assumed to be in local storage —
     * and three and a half seconds was catching the screens mid-hydration and reporting an empty
     * wallet as a content failure.
     */
    await page.waitForTimeout(6000);
    await page.screenshot({ path: path.join(OUT, `${stem}.png`) });
    // Privy's own SDK logs two of these from its confirmation modal and balance reader. They are
    // third-party and attributed rather than excused.
    const bad = [...new Set(errors)].filter((e) => !/isActive|balanceOf|styled-components/i.test(e));
    const net = [...new Set(netFail)];
    const full = await page.innerText('body').catch(() => '');
    if (process.env.QA_TRACE) {
      const w = await page
        .evaluate(() => {
          try {
            return JSON.parse(localStorage.getItem('xorr-store') ?? '{}')?.state?.wallet?.address ?? null;
          } catch {
            return 'ERR';
          }
        })
        .catch(() => 'EVAL-FAIL');
      console.log(`   [trace] ${stem} store.wallet=${w}`);
    }
    const content = contentFailures(stem, full);
    const ok = bad.length === 0 && net.length === 0 && content.length === 0;
    report.push({ stem, route, ok, errors: bad, network: net, content, text: full.slice(0, 400) });
    console.log(
      `${ok ? 'PASS' : 'FAIL'} ${stem.padEnd(24)} ${route}` +
        (bad.length ? `\n       console: ${bad[0]}` : '') +
        (net.length ? `\n       network: ${net.join(' | ')}` : '') +
        (content.length ? `\n       content: ${content.join(' | ')}` : ''),
    );
  }
  await fs.writeFile(path.join(OUT, 'qa-report.json'), JSON.stringify(report, null, 1));

  await browser.close();
  console.log(`\n${ROUTES.length} screens -> docs/screens/`);
};

await main();
