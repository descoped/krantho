import type { SqliteMigration } from '../migration-runner.js'

/**
 * V009: SEO configuration — structured entity graph per site, collection,
 * document, or route.
 *
 * Stores a single `config` JSON column holding a `SeoConfigData` object
 * with an ordered entity array and optional field-mapping overrides.
 * Four scopes:
 * - site: global business identity and site-level entities
 * - collection: default archetype per content collection (primary)
 * - route: URL-pattern override (optional, advanced)
 * - document: per-page override
 */
export const v009SeoConfig: SqliteMigration = {
  version: 9,
  name: 'seo_config',
  apply: (db) => {
    db.exec(`
      CREATE TABLE seo_config (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL CHECK (scope IN ('site', 'collection', 'document', 'route')),
        config TEXT NOT NULL DEFAULT '{"entities":[]}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
    db.exec('CREATE INDEX idx_seo_config_scope ON seo_config(scope)')
  },
}
