import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globals: true,
    environment: 'node',
    // The Postgres suite reads the container URL this setup publishes.
    globalSetup: ['../persistence-postgres/test/postgres-container-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
