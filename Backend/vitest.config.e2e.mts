import { defineConfig } from 'vitest/config';
import unitConfig from './vitest.config.mjs';

/**
 * End-to-end tests: same compilation and database setup, other files.
 * Spread rather than mergeConfig, which would concatenate the `include` arrays.
 */
export default defineConfig({
  ...unitConfig,
  test: {
    ...unitConfig.test,
    include: ['test/**/*.e2e-spec.ts'],
  },
});
