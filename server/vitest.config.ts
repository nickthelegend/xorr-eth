import { defineConfig } from 'vitest/config';

/**
 * The server's own suite, run from `server/`.
 *
 * It shares the reasoning of the root config and needs its own file for two of the same reasons:
 * the live tests must not run in parallel — `http/get.ts` serialises outbound requests per host and
 * that state is per worker, so parallel files give each one an independent lane and the suite
 * rate-limits itself — and they must not start while the executor is still filling its cache.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/*.chain.test.ts'],
    fileParallelism: !process.env.LIVE ? undefined : false,
    globalSetup: ['../tools/wait-for-warm.ts'],
  },
});
