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
    include: ['src/**/*.test.ts'],
    exclude: process.env.LIVE ? [] : ['**/node_modules/**', '**/*.live.test.ts'],
  },
  resolve: {
    alias: {
      'react-native': path.resolve(dir, 'src/test/react-native-stub.ts'),
      '@': path.resolve(dir, 'src'),
    },
  },
});
