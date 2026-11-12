import type { SqliteMigration } from '../migration-runner.js'

/**
 * V008: Site settings — runtime-configurable key-value settings.
 *
 * Used for locale configuration and other admin-editable site settings
 * that shouldn't require a code deploy to change.
 */
export const v008SiteSettings: SqliteMigration = {
  version: 8,
  name: 'site_settings',
  apply: (db) => {
    db.exec(`
      CREATE TABLE site_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
  },
}
