import type { SqliteMigration } from '../migration-runner.js'

/**
 * V003: Per-collection permission overrides.
 *
 * Allows a user to have a different role for specific collections.
 * E.g., viewer globally but editor for the 'blog' collection.
 */
export const v003UserPermissions: SqliteMigration = {
  version: 3,
  name: 'user_permissions',
  apply: (db) => {
    db.exec(`
      CREATE TABLE user_permissions (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        collection TEXT NOT NULL,
        role TEXT NOT NULL,
        PRIMARY KEY (user_id, collection)
      )
    `)
  },
}
