import { defineConfig } from 'vitest/config';
import path from 'node:path';
const dir = import.meta.dirname;

/**
 * Unit tests run on Node against the PURE modules — tokens, formatting, derived values, chart
 * projection, the strategy engine. `react-native` is aliased to a stub because RN ships Flow
 * source that the test parser cannot read; see src/test/react-native-stub.ts.
 * Component rendering is verified in the app itself (the fidelity harness), not here.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    /*
     * The client AND the server.
     *
     * This was `src/**` only, so eight server test files — the rules engine, the audit chain, the
     * planners, the failure translator, the Graph decision, the news feed, the backtest — existed
     * on disk and had never been executed by `npm test`. Tests nobody runs are worse than no
     * tests: they are read as coverage and they rot silently.
     */
    include: ['src/**/*.test.ts', 'server/src/**/*.test.ts'],
    exclude: process.env.LIVE ? [] : ['**/node_modules/**', '**/*.live.test.ts'],
  },
  resolve: {
    alias: {
      'react-native': path.resolve(dir, 'src/test/react-native-stub.ts'),
      '@': path.resolve(dir, 'src'),
    },
  },
});
