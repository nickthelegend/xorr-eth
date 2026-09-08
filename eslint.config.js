const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: [
      'node_modules/**',
      '.expo/**',
      'dist/**',
      // Web build output. `npm run build:base` and `scripts/build-web.mjs` write these; linting a
      // 12MB minified bundle finds ten thousand "errors" in code nobody wrote.
      'dist-base/**',
      'dist-web/**',
      'server/**',
      'ui/**',
      // Vendored Solidity dependencies — not our source to lint.
      'contracts/**',
      'subgraph/**',
      'subgraph-aqua/**',
    ],
  },
];
