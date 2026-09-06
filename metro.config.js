/**
 * Metro configuration.
 *
 * There was no config file at all, which was fine right up until the first native build. On web,
 * bundling never touched `jose` — Privy's JWT verification runs server-side there. On Android the
 * bundle failed outright:
 *
 *   Unable to resolve module zlib from node_modules/jose/dist/node/esm/runtime/zlib.js
 *
 * `jose` publishes a `browser` export that uses WebCrypto and a `node` one that imports `zlib` and
 * `util`. Metro's default export conditions are `require` and `import`, so it picked the Node build
 * — a build that cannot exist in React Native — and there is no `zlib` to give it. Adding the
 * browser condition makes the resolver take the entry the package intends for a WebCrypto runtime,
 * which is what React Native is.
 *
 * `react-native` is listed first so a package that ships an explicit React Native entry still wins
 * over its browser one; conditions are matched in the order the package declares them, and this
 * set only decides which of those declarations we are willing to accept.
 */
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = ['react-native', 'browser', 'require', 'import'];

module.exports = config;
