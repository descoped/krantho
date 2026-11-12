import type { SqliteMigration } from '../migration-runner.js'

/**
 * V005: Advisory content locks.
 *
 * Ephemeral locks for preventing concurrent editing.
 * 5-minute lease, renewed by Studio heartbeat.
 */
export const v005ContentLocks: SqliteMigration = {
  version: 5,
  name: 'content_locks',
  apply: (db) => {
    db.exec(`
      CREATE TABLE content_locks (
        collection TEXT NOT NULL,
        slug TEXT NOT NULL,
        locale TEXT NOT NULL DEFAULT 'en',
        locked_by TEXT NOT NULL,
        locked_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL,
        PRIMARY KEY (collection, slug, locale)
      )
    `)
  },
}
