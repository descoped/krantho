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
import type { Sql, TransactionSql } from 'postgres'

/** Row shape of the versioned media table, as the driver returns it */
interface MediaRow {
  row_id: string
  id: string
  version: number
  is_current: boolean
  filename: string
  storage_key: string | null
  url: string
  alt_text: string
  mime_type: string
  size: number
  width: number | null
  height: number | null
  folder: string | null
  tags: unknown
  crop: MediaCrop | null
  hotspot: MediaHotspot | null
  changed_by: string | null
  deleted_at: Date | null
  created_at: Date
}

/** The fields of a version row, without its identity and timestamps */
type VersionData = Omit<MediaRecord, 'id' | 'createdAt'>

const CURRENT = 'is_current AND deleted_at IS NULL'

/**
 * Postgres implementation of IMediaMetadataAdapter.
 *
 * Append-only: every change inserts a new version row and flips
 * `is_current` inside one transaction; `UNIQUE (id, version)` rejects a
 * concurrent duplicate. A delete appends a tombstone with `deleted_at` set.
 */
export class PostgresMediaAdapter implements IMediaMetadataAdapter {
  constructor(private readonly sql: Sql) {}

  async insert(record: NewMediaRecord): Promise<MediaRecord> {
    const { id, ...data } = record
    return this.sql.begin(async (tx) => {
      await this.writeVersion(tx, id, data, null)
      return requireCurrent(tx, id)
    })
  }

  async get(id: string): Promise<MediaRecord | null> {
    const row = await currentRow(this.sql, id)
    return row ? rowToRecord(row) : null
  }

  async list(
    options?: MediaListOptions | undefined,
  ): Promise<{ items: MediaRecord[]; total: number }> {
    const { where, params } = this.buildFilter(options)
    const limit = `$${params.length + 1}`
    const offset = `$${params.length + 2}`
    const rows = (await this.sql.unsafe(
      `SELECT * FROM media ${where} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      [...params, options?.limit ?? null, options?.offset ?? 0],
    )) as MediaRow[]
    const count = (await this.sql.unsafe(
      `SELECT COUNT(*)::int AS count FROM media ${where}`,
      params,
    )) as Array<{ count: number }>
    return { items: rows.map(rowToRecord), total: count[0]?.count ?? 0 }
  }

  async appendVersion(id: string, changes: MediaRecordChanges): Promise<MediaRecord | null> {
    return this.sql.begin(async (tx) => {
      const current = await currentRow(tx, id)
      if (!current) return null
      const { id: _id, createdAt: _createdAt, ...data } = rowToRecord(current)
      await this.writeVersion(tx, id, { ...data, ...changes }, null)
      return requireCurrent(tx, id)
    })
  }

  async markDeleted(id: string): Promise<MediaRecord | null> {
    return this.sql.begin(async (tx) => {
      const current = await currentRow(tx, id)
      if (!current) return null
      const superseded = rowToRecord(current)
      await this.writeVersion(tx, id, tombstone(superseded), new Date().toISOString())
      return superseded
    })
  }

  async stats(): Promise<MediaStats> {
    const [totals] = (await this.sql.unsafe(
      `SELECT COUNT(*)::int AS items, COALESCE(SUM(size), 0)::bigint AS size FROM media WHERE ${CURRENT}`,
    )) as Array<{ items: number; size: string | number }>
    const folders = (await this.sql.unsafe(
      `SELECT folder, COUNT(*)::int AS count FROM media WHERE ${CURRENT} AND folder IS NOT NULL GROUP BY folder`,
    )) as Array<{ folder: string; count: number }>
    const byFolder = Object.fromEntries(folders.map((row) => [row.folder, row.count]))
    return { totalItems: totals?.items ?? 0, totalSize: Number(totals?.size ?? 0), byFolder }
  }

  async listTags(): Promise<string[]> {
    const rows = (await this.sql.unsafe(
      `SELECT DISTINCT jsonb_array_elements_text(tags) AS tag FROM media WHERE ${CURRENT}`,
    )) as Array<{ tag: string }>
    return rows.map((row) => row.tag).sort()
  }

  /** Insert the next version of `id` and make it current, inside `tx` */
  private async writeVersion(
    tx: TransactionSql,
    id: string,
    data: VersionData,
    deletedAt: string | null,
  ): Promise<void> {
    const max = (await tx.unsafe('SELECT MAX(version) AS max_version FROM media WHERE id = $1', [
      id,
    ])) as Array<{ max_version: number | null }>
    const nextVersion = (max[0]?.max_version ?? 0) + 1
    await tx.unsafe('UPDATE media SET is_current = FALSE WHERE id = $1 AND is_current', [id])
    await tx.unsafe(
      `INSERT INTO media (row_id, id, version, is_current, filename, storage_key, url, alt_text, mime_type, size, width, height, folder, tags, crop, hotspot, deleted_at, created_at)
       VALUES ($1, $2, $3, TRUE, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
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
        this.sql.json(data.tags),
        data.crop ? this.sql.json({ ...data.crop }) : null,
        data.hotspot ? this.sql.json({ ...data.hotspot }) : null,
        deletedAt,
        deletedAt ?? new Date().toISOString(),
      ],
    )
  }

  /** WHERE clause for current records matching search, folder, and tag filters */
  private buildFilter(options: MediaListOptions | undefined): {
    where: string
    params: Array<string | ReturnType<Sql['json']>>
  } {
    const conditions = [CURRENT]
    const params: Array<string | ReturnType<Sql['json']>> = []

    if (options?.search) {
      params.push(`%${escapeSqlLikePattern(options.search)}%`)
      conditions.push(`filename ILIKE $${params.length} ESCAPE '\\'`)
    }
    if (options?.folder !== undefined) {
      if (options.folder === '') {
        conditions.push('folder IS NULL')
      } else {
        params.push(options.folder)
        conditions.push(`folder = $${params.length}`)
      }
    }
    if (options?.tag) {
      params.push(this.sql.json([options.tag]))
      conditions.push(`tags @> $${params.length}`)
    }

    return { where: `WHERE ${conditions.join(' AND ')}`, params }
  }
}

async function currentRow(sql: Sql | TransactionSql, id: string): Promise<MediaRow | undefined> {
  const rows = (await sql.unsafe(`SELECT * FROM media WHERE id = $1 AND ${CURRENT}`, [
    id,
  ])) as MediaRow[]
  return rows[0]
}

async function requireCurrent(tx: TransactionSql, id: string): Promise<MediaRecord> {
  const row = await currentRow(tx, id)
  if (!row) throw new Error(`Media item ${id} not found after write`)
  return rowToRecord(row)
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

function toTags(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === 'string') : []
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
    tags: toTags(row.tags),
    crop: row.crop,
    hotspot: row.hotspot,
    createdAt: row.created_at.toISOString(),
  }
}
