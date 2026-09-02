import { defineConfig } from 'vitest/config';

// GuitAI uses Vite for the dev server and production build, and Vitest
// (which shares this config) for the unit tests of the core logic.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
