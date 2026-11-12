import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SqliteLockAdapter } from '../src/lock-adapter.js'
import { runMigrations } from '../src/migration-runner.js'
import { sqliteMigrations } from '../src/migrations/index.js'

let db: Database.Database
let locks: SqliteLockAdapter

const inAnHour = (): string => new Date(Date.now() + 3_600_000).toISOString()
const aSecondAgo = (): string => new Date(Date.now() - 1_000).toISOString()

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db, sqliteMigrations)
  locks = new SqliteLockAdapter(db)
})

afterEach(() => {
  db.close()
})

describe('SqliteLockAdapter.listLocks', () => {
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
    const remaining = db.prepare('SELECT COUNT(*) AS n FROM content_locks').get() as { n: number }
    expect(remaining.n).toBe(2)
  })

  it('lists nothing when no document is locked', async () => {
    expect(await locks.listLocks()).toEqual([])
  })
})
