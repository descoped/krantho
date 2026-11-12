import type { PostgresMigration } from '../migration-runner.js'

/**
 * V005: Advisory content locks.
 */
export const v005ContentLocks: PostgresMigration = {
  version: 5,
  name: 'content_locks',
  apply: async (sql) => {
    await sql.unsafe(`
      CREATE TABLE content_locks (
        collection TEXT NOT NULL,
        slug TEXT NOT NULL,
        locale TEXT NOT NULL DEFAULT 'en',
        locked_by TEXT NOT NULL,
        locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (collection, slug, locale)
      )
    `)
  },
}
