import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths so the build works inside itch.io's iframe (ARCHITECTURE.md §1).
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
