import { randomUUID } from 'node:crypto'
import type { IMediaFolderStorage, MediaFolder } from '@krantho/persistence'
import type Database from 'better-sqlite3'

interface FolderRow {
  id: string
  name: string
  parent_id: string | null
  created_at: string
}

/** SQLite implementation of IMediaFolderStorage, over the `media_folders` table (v007) */
export class SqliteMediaFolderAdapter implements IMediaFolderStorage {
  constructor(private readonly db: Database.Database) {}

  async listFolders(): Promise<MediaFolder[]> {
    const rows = this.db.prepare('SELECT * FROM media_folders ORDER BY name').all() as FolderRow[]
    return rows.map(rowToFolder)
  }

  async createFolder(name: string, parentId?: string | null): Promise<MediaFolder> {
    if (parentId && !this.exists('SELECT id FROM media_folders WHERE id = ?', parentId)) {
      throw new Error(`Parent folder "${parentId}" not found`)
    }

    const folder: MediaFolder = {
      id: randomUUID(),
      name: name.trim(),
      parentId: parentId ?? null,
      createdAt: new Date().toISOString(),
    }
    this.db
      .prepare('INSERT INTO media_folders (id, name, parent_id, created_at) VALUES (?, ?, ?, ?)')
      .run(folder.id, folder.name, folder.parentId, folder.createdAt)
    return folder
  }

  async renameFolder(id: string, name: string): Promise<MediaFolder | null> {
    const existing = this.db.prepare('SELECT * FROM media_folders WHERE id = ?').get(id) as
      | FolderRow
      | undefined
    if (!existing) return null

    this.db.prepare('UPDATE media_folders SET name = ? WHERE id = ?').run(name.trim(), id)
    return { ...rowToFolder(existing), name: name.trim() }
  }

  async deleteFolder(id: string): Promise<void> {
    if (!this.exists('SELECT id FROM media_folders WHERE id = ?', id)) {
      throw new Error(`Folder "${id}" not found`)
    }
    if (this.exists('SELECT id FROM media_folders WHERE parent_id = ? LIMIT 1', id)) {
      throw new Error('Cannot delete folder: has child folders')
    }
    if (
      this.exists(
        'SELECT id FROM media WHERE folder = ? AND is_current = 1 AND deleted_at IS NULL LIMIT 1',
        id,
      )
    ) {
      throw new Error('Cannot delete folder: contains media items')
    }

    this.db.prepare('DELETE FROM media_folders WHERE id = ?').run(id)
  }

  private exists(query: string, id: string): boolean {
    return this.db.prepare(query).get(id) !== undefined
  }
}

function rowToFolder(row: FolderRow): MediaFolder {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    createdAt: row.created_at,
  }
}
