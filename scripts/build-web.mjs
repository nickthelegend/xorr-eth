/**
 * The hosted build: a static web bundle pointed at the PUBLIC executor.
 *
 * Everything in this repo could be run, and almost nothing could be opened. A judge, or anyone
 * else, got two JSON endpoints and a GIF unless they were willing to clone, create a Postgres and
 * supply three API keys. This produces the thing that was missing.
 *
 * Base Sepolia, not the fork, and that is a correctness decision rather than a convenience one.
 * `src/chain.ts` explains at length that Privy previews and broadcasts through its own RPC for a
 * chain it knows, and a fork of Base is chain 8453 — indistinguishable from real Base — so on a
 * hosted fork build every user-signed transaction would be simulated against mainnet, where the
 * wallet holds nothing. Sepolia is the environment where the signing half is genuinely real. Fills
 * are the half that is not, and the app already says so on the network screen rather than pretending.
 *
 * WHY THIS REWRITES .env RATHER THAN SETTING A VARIABLE
 *
 * Two things were tried first and both produced a flawless build log and a bundle still wired to
 * localhost. Passing EXPO_PUBLIC_API_URL in the shell environment does nothing, because Expo loads
 * `.env` afterwards and wins. Adding `.env.production` did nothing either — whatever mode this
 * export runs in, `.env` is the file that won. So the only thing that reliably decides the value is
 * `.env` itself: it is swapped for the duration of the build and restored in a `finally`, which
 * runs on a failed export and on a Ctrl-C alike.
 *
 * This is the trap `build-base.mjs` documents, and it caught both attempts. Nothing here is trusted
 * without reading the artifact at the end.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'dist-web';
const API = process.env.XORR_WEB_API ?? 'https://executor-production-1659.up.railway.app';
const ENV_FILE = '.env';

/* Refuse to ship a bundle that talks to a machine nobody else can reach. */
if (/localhost|127\.0\.0\.1/.test(API)) {
  console.error(`\n  Refusing to build: ${API} is not reachable from anywhere but this machine.\n`);
  process.exit(1);
}

/* And refuse to ship one pointed at an executor that is down or on the wrong chain. */
const health = await fetch(`${API}/health`).then((r) => r.json());
if (!health.ok) {
  console.error(`\n  Refusing to build: ${API} reports status "${health.status}".\n`);
  process.exit(1);
}
console.log(`  executor up on chain "${health.chain}"`);

if (!existsSync(ENV_FILE)) {
  console.error(`\n  No ${ENV_FILE} to build from. Copy .env.example and fill it in.\n`);
  process.exit(1);
}

/* The developer's own file, restored verbatim below whatever happens. */
const original = readFileSync(ENV_FILE, 'utf8');

try {
  const patched = original
    .split('\n')
    .filter((l) => !/^EXPO_PUBLIC_(API_URL|XORR_CHAIN)=/.test(l))
    .concat([`EXPO_PUBLIC_API_URL=${API}`, `EXPO_PUBLIC_XORR_CHAIN=${health.chain}`, ''])
    .join('\n');
  writeFileSync(ENV_FILE, patched);
  rmSync(OUT, { recursive: true, force: true });
  console.log(`\n  Building the hosted app → ${OUT}\n  executor: ${API}\n`);
  /*
   * `--clear`, always. Metro caches transformed modules, and an inlined `process.env` value is
   * baked into that cache — so changing the variable and rebuilding reuses the old constant and
   * emits a bundle pointed at the previous URL. The third failed attempt at this build was exactly
   * that: `.env` correct on disk, cache stale, log clean.
   */
  execFileSync('npx', ['expo', 'export', '--clear', '--platform', 'web', '--output-dir', OUT], {
    stdio: 'inherit',
  });
} finally {
  writeFileSync(ENV_FILE, original);
}

/*
 * Verify the ARTIFACT, not the intent — the whole reason this script exists.
 *
 * The first attempt at this build set the variable in the shell, printed a flawless log, and
 * produced a bundle still wired to localhost:8788. Only reading the output caught it.
 */
const dir = join(OUT, '_expo/static/js/web');
const bundle = readdirSync(dir)
  .filter((f) => f.startsWith('index-') && f.endsWith('.js'))
  .map((f) => join(dir, f))
  .sort((a, b) => readFileSync(b).length - readFileSync(a).length)[0];
const js = readFileSync(bundle, 'utf8');

/*
 * Only one assertion, and it is the meaningful one. `localhost:8788` is `DEFAULT_BASE` in
 * `apiBase.ts` — a source literal that is in every bundle ever built, so checking for its absence
 * failed a build that was actually fine. The public URL can only reach the bundle by being inlined,
 * so its presence is proof the substitution happened.
 */
const problems = [];
if (!js.includes(API)) problems.push(`the bundle does not contain ${API}`);

if (problems.length) {
  console.error(`\n  Build produced the wrong artifact:\n${problems.map((p) => `    - ${p}`).join('\n')}\n`);
  process.exit(1);
}

/*
 * Make the output deployable on Vercel, where the frontend lives.
 *
 * xorr.finance splits its hosting: the frontend is served by Vercel and the backend — executor,
 * Postgres and the fork — stays on Railway. This script used to emit a zero-dependency Node server
 * and a package.json so Railway could serve the bundle; that was a whole always-on service whose
 * only job was falling back to index.html for routes that are not files.
 *
 * `vercel.json` does the same job without a server. expo export emits ONE index.html and every
 * route in this app is client-side, so a plain file host answers /markets with a 404 and the app
 * never boots. Vercel checks the filesystem before applying a rewrite, so real files — the hashed
 * bundles, fonts, the favicon — are served as themselves and everything else falls back to the app,
 * which then renders its own not-found screen for a route that really does not exist.
 *
 * Hashed assets are immutable; index.html must not be cached, or a deploy never reaches anyone.
 */
writeFileSync(
  join(OUT, 'vercel.json'),
  JSON.stringify(
    {
      rewrites: [{ source: '/(.*)', destination: '/index.html' }],
      headers: [
        {
          source: '/_expo/static/(.*)',
          headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
        },
        { source: '/index.html', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
        { source: '/', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
      ],
    },
    null,
    2,
  ) + '\n',
);

console.log(`\n  ${bundle}\n  points at ${API} — verified in the bundle, not assumed.\n`);
