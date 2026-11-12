import type { SqliteMigration } from '../migration-runner.js'

/**
 * V011: Versioned media metadata.
 *
 * One row per version of a media item; the current version has
 * `is_current = 1`, and a delete appends a tombstone with `deleted_at` set.
 * `storage_key` is the object key in the configured file store, or NULL for
 * a registered external URL. JSON columns (`tags`, `crop`, `hotspot`) are
 * TEXT.
 */
export const v011Media: SqliteMigration = {
  version: 11,
  name: 'media',
  apply: (db) => {
    db.exec(`
      CREATE TABLE media (
        row_id TEXT PRIMARY KEY,
        id TEXT NOT NULL,
        version INTEGER NOT NULL,
        is_current INTEGER NOT NULL DEFAULT 1,
        filename TEXT NOT NULL,
        storage_key TEXT,
        url TEXT NOT NULL,
        alt_text TEXT NOT NULL DEFAULT '',
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        width INTEGER,
        height INTEGER,
        folder TEXT DEFAULT NULL,
        tags TEXT DEFAULT '[]',
        crop TEXT DEFAULT NULL,
        hotspot TEXT DEFAULT NULL,
        changed_by TEXT,
        deleted_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(id, version)
      )
    `)
    db.exec('CREATE INDEX idx_media_current ON media(id) WHERE is_current = 1')
    db.exec('CREATE INDEX idx_media_folder ON media(folder) WHERE is_current = 1')
    db.exec('CREATE INDEX idx_media_filename ON media(filename) WHERE is_current = 1')
  },
}
