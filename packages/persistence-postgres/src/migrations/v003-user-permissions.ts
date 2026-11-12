import type { PostgresMigration } from '../migration-runner.js'

/**
 * V003: Per-collection permission overrides.
 */
export const v003UserPermissions: PostgresMigration = {
  version: 3,
  name: 'user_permissions',
  apply: async (sql) => {
    await sql.unsafe(`
      CREATE TABLE user_permissions (
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        collection TEXT NOT NULL,
        role TEXT NOT NULL,
        PRIMARY KEY (user_id, collection)
      )
    `)
  },
}
