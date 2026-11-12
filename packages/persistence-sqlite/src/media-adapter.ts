import { randomUUID } from 'node:crypto'
import type {
  IMediaMetadataAdapter,
  MediaCrop,
  MediaHotspot,
  MediaListOptions,
  MediaRecord,
  MediaRecordChanges,
  MediaStats,
  NewMediaRecord,
} from '@krantho/persistence'
import { escapeSqlLikePattern } from '@krantho/persistence'
import type Database from 'better-sqlite3'

/** Row shape of the versioned media table */
interface MediaRow {
  row_id: string
  id: string
  version: number
  is_current: number
  filename: string
  storage_key: string | null
  url: string
  alt_text: string
  mime_type: string
  size: number
  width: number | null
  height: number | null
  folder: string | null
  tags: string | null
  crop: string | null
  hotspot: string | null
  changed_by: string | null
  deleted_at: string | null
  created_at: string
}

/** The fields of a version row, without its identity and timestamps */
type VersionData = Omit<MediaRecord, 'id' | 'createdAt'>

const CURRENT = 'is_current = 1 AND deleted_at IS NULL'

/**
 * SQLite implementation of IMediaMetadataAdapter.
 *
 * Append-only: every change inserts a new version row and flips
 * `is_current`; a delete appends a tombstone with `deleted_at` set.
 */
export class SqliteMediaAdapter implements IMediaMetadataAdapter {
  constructor(private readonly db: Database.Database) {}

  async insert(record: NewMediaRecord): Promise<MediaRecord> {
    const { id, ...data } = record
    return this.db.transaction(() => {
      this.writeVersion(id, data, null)
      return this.requireCurrent(id)
    })()
  }

  async get(id: string): Promise<MediaRecord | null> {
    const row = this.currentRow(id)
    return row ? rowToRecord(row) : null
  }

  async list(
    options?: MediaListOptions | undefined,
  ): Promise<{ items: MediaRecord[]; total: number }> {
    const { where, params } = buildFilter(options)
    const page = buildPage(options)
    const rows = this.db
      .prepare(`SELECT * FROM media ${where} ORDER BY created_at DESC${page.sql}`)
      .all(...params, ...page.params) as MediaRow[]
    const count = this.db
      .prepare(`SELECT COUNT(*) AS count FROM media ${where}`)
      .get(...params) as {
      count: number
    }
    return { items: rows.map(rowToRecord), total: count.count }
  }

  async appendVersion(id: string, changes: MediaRecordChanges): Promise<MediaRecord | null> {
    return this.db.transaction(() => {
      const current = this.currentRow(id)
      if (!current) return null
      const { id: _id, createdAt: _createdAt, ...data } = rowToRecord(current)
      this.writeVersion(id, { ...data, ...changes }, null)
      return this.requireCurrent(id)
    })()
  }

  async markDeleted(id: string): Promise<MediaRecord | null> {
    return this.db.transaction(() => {
      const current = this.currentRow(id)
      if (!current) return null
      const superseded = rowToRecord(current)
      this.writeVersion(id, tombstone(superseded), new Date().toISOString())
      return superseded
    })()
  }

  async stats(): Promise<MediaStats> {
    const totals = this.db
      .prepare(
        `SELECT COUNT(*) AS items, COALESCE(SUM(size), 0) AS size FROM media WHERE ${CURRENT}`,
      )
      .get() as { items: number; size: number }
    const folders = this.db
      .prepare(
        `SELECT folder, COUNT(*) AS count FROM media WHERE ${CURRENT} AND folder IS NOT NULL GROUP BY folder`,
      )
      .all() as Array<{ folder: string; count: number }>
    const byFolder = Object.fromEntries(folders.map((row) => [row.folder, row.count]))
    return { totalItems: totals.items, totalSize: totals.size, byFolder }
  }

  async listTags(): Promise<string[]> {
    const rows = this.db
      .prepare(`SELECT tags FROM media WHERE ${CURRENT} AND tags IS NOT NULL AND tags != '[]'`)
      .all() as Array<{ tags: string }>
    const tagSet = new Set<string>()
    for (const row of rows) {
      for (const tag of parseJson<string[]>(row.tags) ?? []) tagSet.add(tag)
    }
    return [...tagSet].sort()
  }

  private currentRow(id: string): MediaRow | undefined {
    return this.db.prepare(`SELECT * FROM media WHERE id = ? AND ${CURRENT}`).get(id) as
      | MediaRow
      | undefined
  }

  private requireCurrent(id: string): MediaRecord {
    const row = this.currentRow(id)
    if (!row) throw new Error(`Media item ${id} not found after write`)
    return rowToRecord(row)
  }

  /** Insert the next version of `id` and make it current. Runs inside a transaction. */
  private writeVersion(id: string, data: VersionData, deletedAt: string | null): void {
    const max = this.db
      .prepare('SELECT MAX(version) AS max_version FROM media WHERE id = ?')
      .get(id) as { max_version: number | null }
    const nextVersion = (max.max_version ?? 0) + 1
    this.db.prepare('UPDATE media SET is_current = 0 WHERE id = ? AND is_current = 1').run(id)
    this.db
      .prepare(
        `INSERT INTO media (row_id, id, version, is_current, filename, storage_key, url, alt_text, mime_type, size, width, height, folder, tags, crop, hotspot, deleted_at, created_at)
         VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        id,
        nextVersion,
        data.filename,
        data.storageKey,
        data.url,
        data.altText,
        data.mimeType,
        data.size,
        data.width,
        data.height,
        data.folder,
        JSON.stringify(data.tags),
        data.crop ? JSON.stringify(data.crop) : null,
        data.hotspot ? JSON.stringify(data.hotspot) : null,
        deletedAt,
        deletedAt ?? new Date().toISOString(),
      )
  }
}

/** The tombstone version that replaces a deleted record */
function tombstone(record: MediaRecord): VersionData {
  return {
    filename: record.filename,
    storageKey: record.storageKey,
    url: record.url,
    altText: '',
    mimeType: record.mimeType,
    size: 0,
    width: null,
    height: null,
    folder: null,
    tags: [],
    crop: null,
    hotspot: null,
  }
}

/** WHERE clause for current records matching search, folder, and tag filters */
function buildFilter(options: MediaListOptions | undefined): { where: string; params: unknown[] } {
  const conditions = [CURRENT]
  const params: unknown[] = []

  if (options?.search) {
    conditions.push("filename LIKE ? ESCAPE '\\'")
    params.push(`%${escapeSqlLikePattern(options.search)}%`)
  }
  if (options?.folder !== undefined) {
    if (options.folder === '') {
      conditions.push('folder IS NULL')
    } else {
      conditions.push('folder = ?')
      params.push(options.folder)
    }
  }
  if (options?.tag) {
    conditions.push("tags LIKE ? ESCAPE '\\'")
    params.push(`%${escapeSqlLikePattern(JSON.stringify(options.tag))}%`)
  }

  return { where: `WHERE ${conditions.join(' AND ')}`, params }
}

/** LIMIT/OFFSET clause; SQLite needs a LIMIT (-1 = none) before an OFFSET */
function buildPage(options: MediaListOptions | undefined): { sql: string; params: unknown[] } {
  if (options?.limit === undefined && options?.offset === undefined) {
    return { sql: '', params: [] }
  }
  return { sql: ' LIMIT ? OFFSET ?', params: [options.limit ?? -1, options.offset ?? 0] }
}

function parseJson<T>(text: string | null): T | null {
  if (!text) return null
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

function rowToRecord(row: MediaRow): MediaRecord {
  return {
    id: row.id,
    filename: row.filename,
    storageKey: row.storage_key,
    url: row.url,
    altText: row.alt_text,
    mimeType: row.mime_type,
    size: row.size,
    width: row.width,
    height: row.height,
    folder: row.folder,
    tags: parseJson<string[]>(row.tags) ?? [],
    crop: parseJson<MediaCrop>(row.crop),
    hotspot: parseJson<MediaHotspot>(row.hotspot),
    createdAt: row.created_at,
  }
}
