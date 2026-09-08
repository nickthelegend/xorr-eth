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
 * Make the output a deployable unit rather than a folder of files.
 *
 * expo export emits one index.html and a pile of hashed assets; every route in this app is
 * client-side, so a plain file server answers /markets with a 404 and the app never boots. These
 * two files are what turn the export into something a host can run: a zero-dependency server that
 * falls back to index.html for anything that is not a real file, and a package.json so the host
 * knows how to start it without an install step.
 */
writeFileSync(
  join(OUT, 'server.mjs'),
  `import http from 'node:http';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';

const ROOT = import.meta.dirname;
const PORT = process.env.PORT ?? 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.map': 'application/json',
  '.ico': 'image/x-icon', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

http
  .createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
    // normalize + the prefix check keeps ../ out of the file lookup.
    const candidate = join(ROOT, normalize(path));
    const isFile = candidate.startsWith(ROOT) && existsSync(candidate) && statSync(candidate).isFile();
    const file = isFile ? candidate : join(ROOT, 'index.html');
    const type = TYPES[extname(file)] ?? 'application/octet-stream';
    // Hashed assets are immutable; index.html must not be, or a deploy never reaches anyone.
    const cache = isFile && path.startsWith('/_expo/')
      ? 'public, max-age=31536000, immutable'
      : 'no-cache';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache });
    res.end(readFileSync(file));
  })
  .listen(PORT, () => console.log('xorr web on ' + PORT));
`,
);

writeFileSync(
  join(OUT, 'package.json'),
  JSON.stringify({ name: 'xorr-web', private: true, type: 'module', scripts: { start: 'node server.mjs' } }, null, 2) + '\n',
);

console.log(`\n  ${bundle}\n  points at ${API} — verified in the bundle, not assumed.\n`);
