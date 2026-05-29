import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'worker/**/*.{test,spec}.ts'],
    pool: 'forks',
    forks: { singleFork: true },
    coverage: {
      reporter: ['text', 'html'],
      exclude: ['**/*.config.*', '**/test/**', '**/*.d.ts', 'src/main.tsx'],
      // Floor set just below the 2026-05-28 baseline (stmts 71.95 / branch 60.58 /
      // funcs 63.7 / lines 74.77). Ratchet these UP as coverage improves; never down.
      thresholds: {
        statements: 70,
        branches: 58,
        functions: 60,
        lines: 72,
      },
    },
  },
});
