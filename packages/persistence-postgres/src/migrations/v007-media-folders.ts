import type { PostgresMigration } from '../migration-runner.js'

/**
 * V007: Media folders — hierarchical folder structure for media organization.
 */
export const v007MediaFolders: PostgresMigration = {
  version: 7,
  name: 'media_folders',
  apply: async (sql) => {
    await sql.unsafe(`
      CREATE TABLE media_folders (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        parent_id TEXT REFERENCES media_folders(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await sql.unsafe('CREATE INDEX idx_media_folders_parent ON media_folders(parent_id)')
  },
}
