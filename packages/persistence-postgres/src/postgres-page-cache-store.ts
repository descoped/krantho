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
import type { Sql } from 'postgres'

interface EntryRow {
  value: string
  tags: string[]
  last_modified: string
}

interface TagStateRow {
  expired: boolean
  stale: boolean
}

/**
 * Postgres implementation of `IPageCacheStore`, shared by every instance of a
 * site. Timestamps come from the database clock (`clock_timestamp()`), so an
 * entry written on one instance and a mark made on another compare on one clock.
 */
export class PostgresPageCacheStore implements IPageCacheStore {
  constructor(private readonly sql: Sql) {}

  async get(key: string): Promise<PageCacheEntry | null> {
    const rows = await this.sql<EntryRow[]>`
      SELECT value, tags, last_modified FROM page_cache_entries WHERE key = ${key}`
    const row = rows[0]
    if (!row) return null
    return {
      value: decodePageCacheValue(row.value),
      tags: row.tags,
      lastModified: Number(row.last_modified),
    }
  }

  async set(key: string, value: PageCacheValue, tags: readonly string[]): Promise<void> {
    await this.sql`
      INSERT INTO page_cache_entries (key, value, tags, last_modified)
      VALUES (
        ${key},
        ${encodePageCacheValue(value)},
        ${this.sql.array(uniquePageCacheTags(tags))}::text[],
        floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint
      )
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        tags = EXCLUDED.tags,
        last_modified = EXCLUDED.last_modified`
  }

  async tagsRevalidatedSince(tags: readonly string[], since: number): Promise<PageCacheTagState> {
    if (tags.length === 0) return 'fresh'
    const rows = await this.sql<TagStateRow[]>`
      SELECT
        COALESCE(bool_or(expired_at >= ${Math.floor(since)}::bigint), false) AS expired,
        COALESCE(bool_or(stale_at >= ${Math.floor(since)}::bigint), false) AS stale
      FROM page_cache_tags
      WHERE tag = ANY(${this.sql.array(uniquePageCacheTags(tags))}::text[])`
    const row = rows[0]
    if (row?.expired) return 'expired'
    return row?.stale ? 'stale' : 'fresh'
  }

  /**
   * One statement: atomic, and each tag's timestamps only ever move forward
   * (`GREATEST` ignores NULL, so a stale mark keeps an earlier expiry). Tags are
   * upserted in sorted order so concurrent marks lock rows in one order and
   * cannot deadlock.
   */
  async markTags(tags: readonly string[], options: PageCacheMarkOptions): Promise<void> {
    if (tags.length === 0) return
    await this.sql`
      WITH clock AS (SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS ms)
      INSERT INTO page_cache_tags (tag, stale_at, expired_at)
      SELECT t, clock.ms, CASE WHEN ${options.expire}::boolean THEN clock.ms END
      FROM unnest(${this.sql.array(uniquePageCacheTags(tags).sort())}::text[]) AS t, clock
      ORDER BY t
      ON CONFLICT (tag) DO UPDATE SET
        stale_at = GREATEST(page_cache_tags.stale_at, EXCLUDED.stale_at),
        expired_at = GREATEST(page_cache_tags.expired_at, EXCLUDED.expired_at)`
  }

  async countTagged(tags: readonly string[]): Promise<number> {
    if (tags.length === 0) return 0
    const rows = await this.sql<{ count: string }[]>`
      SELECT COUNT(*) AS count FROM page_cache_entries
      WHERE tags && ${this.sql.array(uniquePageCacheTags(tags))}::text[]`
    return Number(rows[0]?.count ?? 0)
  }
}
