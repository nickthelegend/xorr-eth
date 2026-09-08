const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: [
      'node_modules/**',
      '.expo/**',
      'dist/**',
      // Web build output. `npm run build:base` writes it; linting a 12MB minified bundle finds
      // ten thousand "errors" in code nobody wrote.
      'dist-base/**',
      'server/**',
      'ui/**',
      // Vendored Solidity dependencies — not our source to lint.
      'contracts/**',
      'subgraph/**',
      'subgraph-aqua/**',
    ],
  },
];
