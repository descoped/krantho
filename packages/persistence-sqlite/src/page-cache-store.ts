import type {
  IPageCacheStore,
  PageCacheEntry,
  PageCacheMarkOptions,
  PageCacheTagState,
  PageCacheValue,
} from '@krantho/persistence'
import {
  decodePageCacheValue,
  encodePageCacheValue,
  uniquePageCacheTags,
} from '@krantho/persistence'
import type { Database } from 'better-sqlite3'

interface EntryRow {
  value: string
  tags: string
  last_modified: number
}

interface TagStateRow {
  expired: number | null
  stale: number | null
}

/**
 * SQLite implementation of `IPageCacheStore`. Timestamps come from this
 * process's clock (`Date.now()`) — a SQLite database has one host.
 */
export class SqlitePageCacheStore implements IPageCacheStore {
  constructor(private readonly db: Database) {}

  async get(key: string): Promise<PageCacheEntry | null> {
    const row = this.db
      .prepare('SELECT value, tags, last_modified FROM page_cache_entries WHERE key = ?')
      .get(key) as EntryRow | undefined
    if (!row) return null
    return {
      value: decodePageCacheValue(row.value),
      tags: JSON.parse(row.tags) as string[],
      lastModified: row.last_modified,
    }
  }

  async set(key: string, value: PageCacheValue, tags: readonly string[]): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO page_cache_entries (key, value, tags, last_modified) VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           tags = excluded.tags,
           last_modified = excluded.last_modified`,
      )
      .run(key, encodePageCacheValue(value), JSON.stringify(uniquePageCacheTags(tags)), Date.now())
  }

  async tagsRevalidatedSince(tags: readonly string[], since: number): Promise<PageCacheTagState> {
    if (tags.length === 0) return 'fresh'
    const row = this.db
      .prepare(
        `SELECT
           MAX(CASE WHEN expired_at >= ? THEN 1 ELSE 0 END) AS expired,
           MAX(CASE WHEN stale_at >= ? THEN 1 ELSE 0 END) AS stale
         FROM page_cache_tags
         WHERE tag IN (SELECT value FROM json_each(?))`,
      )
      .get(since, since, JSON.stringify(uniquePageCacheTags(tags))) as TagStateRow
    if (row.expired === 1) return 'expired'
    return row.stale === 1 ? 'stale' : 'fresh'
  }

  /** One statement: atomic, and each tag's timestamps only ever move forward */
  async markTags(tags: readonly string[], options: PageCacheMarkOptions): Promise<void> {
    if (tags.length === 0) return
    const now = Date.now()
    this.db
      .prepare(
        `INSERT INTO page_cache_tags (tag, stale_at, expired_at)
         SELECT value, ?, ? FROM json_each(?) WHERE true
         ON CONFLICT(tag) DO UPDATE SET
           stale_at = max(stale_at, excluded.stale_at),
           expired_at = CASE
             WHEN excluded.expired_at IS NULL THEN expired_at
             WHEN expired_at IS NULL THEN excluded.expired_at
             ELSE max(expired_at, excluded.expired_at)
           END`,
      )
      .run(now, options.expire ? now : null, JSON.stringify(uniquePageCacheTags(tags)))
  }

  async countTagged(tags: readonly string[]): Promise<number> {
    if (tags.length === 0) return 0
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS count FROM page_cache_entries
         WHERE EXISTS (
           SELECT 1 FROM json_each(page_cache_entries.tags)
           WHERE value IN (SELECT value FROM json_each(?))
         )`,
      )
      .get(JSON.stringify(uniquePageCacheTags(tags))) as { count: number }
    return row.count
  }
}
