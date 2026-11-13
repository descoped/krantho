/**
 * Vitest global setup for Postgres integration tests.
 *
 * Starts a single pooled Postgres container for the whole test run and
 * publishes its connection URL via `process.env.KRANTHO_TEST_POSTGRES_URL`,
 * which the individual test files pick up.
 *
 * Container pooling happens at two levels:
 *
 * 1. **Within a single test run**: this globalSetup runs exactly once per
 *    `vitest run` invocation, so every test file that needs Postgres shares
 *    the same container instead of starting its own.
 *
 * 2. **Across test runs**: `.withReuse()` tells testcontainers to leave the
 *    container running after the test process exits. On the next run, if a
 *    container with the same configuration hash exists, it's reused — startup
 *    drops from ~3s (new container) to ~50ms (attach to existing). Requires
 *    the `TESTCONTAINERS_REUSE_ENABLE` env var to be truthy (the default in
 *    local dev). In CI, set the env var to `false` to start fresh containers
 *    per run.
 *
 * Per the testcontainers docs, `PostgreSqlContainer` requires explicit
 * credentials to enable reuse — random credentials would break the config
 * hash match.
 */

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'

let container: StartedPostgreSqlContainer | null = null

export async function setup(): Promise<void> {
  container = await new PostgreSqlContainer('postgres:18-alpine')
    .withDatabase('krantho_test')
    .withUsername('krantho')
    .withPassword('krantho')
    .withReuse()
    .start()

  process.env.KRANTHO_TEST_POSTGRES_URL = container.getConnectionUri()
}

export async function teardown(): Promise<void> {
  // Reuse mode (opt-in via TESTCONTAINERS_REUSE_ENABLE=true): leave the
  // container running so the next test run can reattach in ~50ms instead of
  // starting fresh. This matches the `.withReuse()` call in setup().
  //
  // Default mode (CI, local dev without the env var): stop the container
  // cleanly. Without this explicit stop, cleanup would fall through to the
  // testcontainers Ryuk reaper, which SIGKILLs the container after the
  // parent exits and leaves a stopped container behind in `docker ps -a`.
  const reuseEnabled = process.env.TESTCONTAINERS_REUSE_ENABLE?.toLowerCase() === 'true'
  if (!reuseEnabled) await stopUnlessGone(container)
  container = null
}

/**
 * Stop the container. persistence-contract runs this setup too, and the two runs
 * can share one container, so the other teardown may have removed it already.
 */
async function stopUnlessGone(started: StartedPostgreSqlContainer | null): Promise<void> {
  try {
    await started?.stop()
  } catch (error) {
    const status = (error as { statusCode?: unknown }).statusCode
    if (status !== 404) throw error
  }
}
