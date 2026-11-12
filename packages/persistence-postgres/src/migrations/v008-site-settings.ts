import type { PostgresMigration } from '../migration-runner.js'

/**
 * V008: Site settings — runtime-configurable key-value settings.
 */
export const v008SiteSettings: PostgresMigration = {
  version: 8,
  name: 'site_settings',
  apply: async (sql) => {
    await sql.unsafe(`
      CREATE TABLE site_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
  },
}
