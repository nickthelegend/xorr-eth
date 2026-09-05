import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Chain tests need a running validator; they are opt-in via CHAIN=1.
    exclude: process.env.CHAIN ? ['**/node_modules/**'] : ['**/node_modules/**', '**/*.chain.test.ts'],
    fileParallelism: false,
    testTimeout: 120_000,
  },
});
