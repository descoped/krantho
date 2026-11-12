import type { PostgresMigration } from '../migration-runner.js'

/**
 * V009: SEO configuration — structured entity graph per site, collection,
 * document, or route.
 *
 * Stores a single `config` JSONB column holding a `SeoConfigData` object
 * with an ordered entity array and optional field-mapping overrides.
 * A GIN index on the column enables containment queries for site-wide
 * lookups (e.g. "find every doc that uses an Article entity").
 */
export const v009SeoConfig: PostgresMigration = {
  version: 9,
  name: 'seo_config',
  apply: async (sql) => {
    await sql.unsafe(`
      CREATE TABLE seo_config (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL CHECK (scope IN ('site', 'collection', 'document', 'route')),
        config JSONB NOT NULL DEFAULT '{"entities":[]}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await sql.unsafe('CREATE INDEX idx_seo_config_scope ON seo_config(scope)')
    await sql.unsafe(
      'CREATE INDEX idx_seo_config_gin ON seo_config USING GIN (config jsonb_path_ops)',
    )
  },
}
