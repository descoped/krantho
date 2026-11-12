import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Start a pooled Postgres container once per test run; tests read the
    // connection URL from process.env.KRANTHO_TEST_POSTGRES_URL. withReuse()
    // inside the setup file means containers persist across runs too, so
    // incremental local dev reattaches in ~50ms instead of starting fresh.
    globalSetup: ['./test/postgres-container-setup.ts'],
    // Container startup + migrations take a few seconds on first run.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
