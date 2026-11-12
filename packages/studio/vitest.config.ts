import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    // Under a parallel, workspace-wide run a screen's first render can take seconds
    testTimeout: 20_000,
  },
})
