import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      // Vitest 5 measures every file matched by `include`, including ones no test imports.
      include: ['src/**/*.{ts,tsx,js,mjs}'],
      exclude: ['**/*.stories.*', '**/*.d.ts', '**/*.test.*', '**/*.spec.*'],
      // 100% is mandatory on git push and in CI. Do not lower these.
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
