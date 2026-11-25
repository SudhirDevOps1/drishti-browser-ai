import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/*/src/**', 'apps/*/src/**'],
      exclude: ['**/dist/**', '**/*.d.ts'],
    },
    testTimeout: 20000,
  },
});
