import type { PostgresMigration } from '../migration-runner.js'

/**
 * V011: Versioned media metadata.
 *
 * One row per version of a media item; the current version has
 * `is_current = TRUE`, and a delete appends a tombstone with `deleted_at`
 * set. `storage_key` is the object key in the configured file store, or NULL
 * for a registered external URL. `size` is INTEGER so the driver returns a
 * number, not a bigint string.
 */
export const v011Media: PostgresMigration = {
  version: 11,
  name: 'media',
  apply: async (sql) => {
    await sql.unsafe(`
      CREATE TABLE media (
        row_id TEXT PRIMARY KEY,
        id TEXT NOT NULL,
        version INTEGER NOT NULL,
        is_current BOOLEAN NOT NULL DEFAULT TRUE,
        filename TEXT NOT NULL,
        storage_key TEXT,
        url TEXT NOT NULL,
        alt_text TEXT NOT NULL DEFAULT '',
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        width INTEGER,
        height INTEGER,
        folder TEXT,
        tags JSONB NOT NULL DEFAULT '[]',
        crop JSONB,
        hotspot JSONB,
        changed_by TEXT,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (id, version)
      )
    `)
    await sql.unsafe('CREATE INDEX idx_media_current ON media(id) WHERE is_current')
    await sql.unsafe('CREATE INDEX idx_media_folder ON media(folder) WHERE is_current')
    await sql.unsafe('CREATE INDEX idx_media_filename ON media(filename) WHERE is_current')
  },
}
