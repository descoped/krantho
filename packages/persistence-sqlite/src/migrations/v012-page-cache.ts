import type { SqliteMigration } from '../migration-runner.js'

/**
 * V012: shared page cache — rendered pages and fetch results, and the latest
 * stale and expire mark per cache tag.
 *
 * `page_cache_entries.value` holds the encoded value (JSON text, binary leaves
 * base64 — `encodePageCacheValue` in `@krantho/persistence`); `tags` is a JSON
 * array replaced on every write. Timestamps are epoch milliseconds.
 * `page_cache_tags.expired_at` is NULL until a tag is first expired.
 */
export const v012PageCache: SqliteMigration = {
  version: 12,
  name: 'page_cache',
  apply: (db) => {
    db.exec(`
      CREATE TABLE page_cache_entries (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        last_modified INTEGER NOT NULL
      )
    `)
    db.exec(`
      CREATE TABLE page_cache_tags (
        tag TEXT PRIMARY KEY,
        stale_at INTEGER NOT NULL,
        expired_at INTEGER
      )
    `)
  },
}
