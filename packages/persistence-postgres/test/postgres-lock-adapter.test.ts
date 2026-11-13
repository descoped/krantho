import type { Sql } from 'postgres'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { runMigrations } from '../src/migration-runner.js'
import { postgresMigrations } from '../src/migrations/index.js'
import { PostgresLockAdapter } from '../src/postgres-lock-adapter.js'

const inAnHour = (): string => new Date(Date.now() + 3_600_000).toISOString()
const aSecondAgo = (): string => new Date(Date.now() - 1_000).toISOString()

describe('PostgresLockAdapter.listLocks (integration)', () => {
  let sql: Sql
  let locks: PostgresLockAdapter

  beforeAll(async () => {
    const connectionUri = process.env.KRANTHO_TEST_POSTGRES_URL
    if (!connectionUri) {
      throw new Error('KRANTHO_TEST_POSTGRES_URL not set — globalSetup did not run.')
    }
    sql = postgres(connectionUri, { max: 4, onnotice: () => {} })
    await runMigrations(sql, postgresMigrations)
    locks = new PostgresLockAdapter(sql)
  })

  afterAll(async () => {
    await sql?.end({ timeout: 5 })
  })

  beforeEach(async () => {
    await sql`TRUNCATE TABLE content_locks`
  })

  it('lists the unexpired locks by collection, slug and locale, and drops the expired ones', async () => {
    await locks.acquireLock('pages', 'home', 'nb', 'editor:b@example.com', inAnHour())
    await locks.acquireLock('pages', 'about', 'en', 'editor:a@example.com', inAnHour())
    await locks.acquireLock('blog', 'old', 'en', 'editor:c@example.com', aSecondAgo())

    const listed = await locks.listLocks()

    expect(listed.map((lock) => `${lock.collection}/${lock.slug}@${lock.locale}`)).toEqual([
      'pages/about@en',
      'pages/home@nb',
    ])
    expect(listed[0]).toMatchObject({ lockedBy: 'editor:a@example.com' })
    expect(listed[0]?.expiresAt).toMatch(/Z$/)
    const [remaining] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM content_locks`
    expect(remaining?.n).toBe(2)
  })
})
