import type { PostgresMigration } from '../migration-runner.js'

/**
 * V012: shared page cache — rendered pages and fetch results, and the latest
 * stale and expire mark per cache tag, shared by every instance of a site.
 *
 * `page_cache_entries.value` holds the encoded value (JSON text kept verbatim,
 * binary leaves base64 — `encodePageCacheValue` in `@krantho/persistence`);
 * `tags` is replaced on every write. Timestamps are epoch milliseconds on the
 * database clock. `page_cache_tags.expired_at` is NULL until a tag is first expired.
 */
export const v012PageCache: PostgresMigration = {
  version: 12,
  name: 'page_cache',
  apply: async (sql) => {
    await sql.unsafe(`
      CREATE TABLE page_cache_entries (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        tags TEXT[] NOT NULL DEFAULT '{}',
        last_modified BIGINT NOT NULL
      )
    `)
    await sql.unsafe(`
      CREATE TABLE page_cache_tags (
        tag TEXT PRIMARY KEY,
        stale_at BIGINT NOT NULL,
        expired_at BIGINT
      )
    `)
  },
}
