import type { SqliteMigration } from '../migration-runner.js'

/**
 * V007: Media folders — hierarchical folder structure for media organization.
 *
 * Replaces the flat `folder` TEXT column on media with a proper
 * `media_folders` table supporting parent-child nesting.
 * The media table's `folder` column now stores a folder ID (FK).
 */
export const v007MediaFolders: SqliteMigration = {
  version: 7,
  name: 'media_folders',
  apply: (db) => {
    db.exec(`
      CREATE TABLE media_folders (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        parent_id TEXT REFERENCES media_folders(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
    db.exec('CREATE INDEX idx_media_folders_parent ON media_folders(parent_id)')
  },
}
