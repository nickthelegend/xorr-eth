const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: [
      'node_modules/**',
      '.expo/**',
      'dist/**',
      'server/**',
      'ui/**',
      // Vendored Solidity dependencies — not our source to lint.
      'contracts/**',
      'subgraph/**',
      'subgraph-aqua/**',
    ],
  },
];
