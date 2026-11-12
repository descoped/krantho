import { randomUUID } from 'node:crypto'
import type { IMediaFolderStorage, MediaFolder } from '@krantho/persistence'
import type { Sql } from 'postgres'

interface FolderRow {
  id: string
  name: string
  parent_id: string | null
  created_at: Date
}

/** Postgres implementation of IMediaFolderStorage, over the `media_folders` table (v007) */
export class PostgresMediaFolderAdapter implements IMediaFolderStorage {
  constructor(private readonly sql: Sql) {}

  async listFolders(): Promise<MediaFolder[]> {
    // Byte-order collation, matching SQLite's BINARY ordering
    const rows = await this.sql<FolderRow[]>`
      SELECT * FROM media_folders ORDER BY name COLLATE "C"`
    return rows.map(rowToFolder)
  }

  async createFolder(name: string, parentId?: string | null): Promise<MediaFolder> {
    if (parentId) {
      const parent = await this.sql`SELECT id FROM media_folders WHERE id = ${parentId}`
      if (parent.length === 0) throw new Error(`Parent folder "${parentId}" not found`)
    }

    const folder: MediaFolder = {
      id: randomUUID(),
      name: name.trim(),
      parentId: parentId ?? null,
      createdAt: new Date().toISOString(),
    }
    await this.sql`
      INSERT INTO media_folders (id, name, parent_id, created_at)
      VALUES (${folder.id}, ${folder.name}, ${folder.parentId}, ${folder.createdAt})`
    return folder
  }

  async renameFolder(id: string, name: string): Promise<MediaFolder | null> {
    const rows = await this.sql<FolderRow[]>`
      UPDATE media_folders SET name = ${name.trim()} WHERE id = ${id} RETURNING *`
    const row = rows[0]
    return row ? rowToFolder(row) : null
  }

  async deleteFolder(id: string): Promise<void> {
    const existing = await this.sql`SELECT id FROM media_folders WHERE id = ${id}`
    if (existing.length === 0) throw new Error(`Folder "${id}" not found`)

    const child = await this.sql`SELECT id FROM media_folders WHERE parent_id = ${id} LIMIT 1`
    if (child.length > 0) throw new Error('Cannot delete folder: has child folders')

    const media = await this.sql`
      SELECT id FROM media
      WHERE folder = ${id} AND is_current AND deleted_at IS NULL LIMIT 1`
    if (media.length > 0) throw new Error('Cannot delete folder: contains media items')

    await this.sql`DELETE FROM media_folders WHERE id = ${id}`
  }
}

function rowToFolder(row: FolderRow): MediaFolder {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    createdAt: row.created_at.toISOString(),
  }
}
