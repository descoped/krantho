import type { IRetentionAdapter, PurgeResult } from '@krantho/persistence'

interface VersionGroup {
  collection: string
  slug: string
  locale: string
  version_count: number
}

/** SQLite implementation of version retention/purge */
export class SqliteRetentionAdapter implements IRetentionAdapter {
  private readonly db: import('better-sqlite3').Database

  constructor(db: import('better-sqlite3').Database) {
    this.db = db
  }

  async purgeVersions(maxVersionsPerItem: number): Promise<PurgeResult[]> {
    if (maxVersionsPerItem < 1) {
      throw new Error('maxVersionsPerItem must be at least 1')
    }

    // Find items with more versions than the limit
    const groups = this.db
      .prepare(
        `SELECT collection, slug, locale, COUNT(*) as version_count
         FROM content
         WHERE deleted_at IS NULL
         GROUP BY collection, slug, locale
         HAVING COUNT(*) > ?`,
      )
      .all(maxVersionsPerItem) as VersionGroup[]

    const results: PurgeResult[] = []

    for (const group of groups) {
      const toPurge = group.version_count - maxVersionsPerItem

      // Delete oldest non-current versions, never the one that is live. When the
      // live version is among the oldest, fewer rows go and the document stays
      // over the limit until later versions age out.
      const deleted = this.db
        .prepare(
          `DELETE FROM content WHERE id IN (
            SELECT id FROM content
            WHERE collection = ? AND slug = ? AND locale = ? AND is_current = 0
              AND version IS NOT (
                SELECT live_version FROM content
                WHERE collection = ? AND slug = ? AND locale = ? AND is_current = 1
              )
            ORDER BY version ASC
            LIMIT ?
          )`,
        )
        .run(
          group.collection,
          group.slug,
          group.locale,
          group.collection,
          group.slug,
          group.locale,
          toPurge,
        )

      if (deleted.changes > 0) {
        results.push({
          collection: group.collection,
          slug: group.slug,
          purged: deleted.changes,
          retained: group.version_count - deleted.changes,
        })
      }
    }

    return results
  }

  async countVersions(): Promise<{ total: number; current: number; historical: number }> {
    const total = this.db
      .prepare('SELECT COUNT(*) as count FROM content WHERE deleted_at IS NULL')
      .get() as { count: number }
    const current = this.db
      .prepare('SELECT COUNT(*) as count FROM content WHERE is_current = 1 AND deleted_at IS NULL')
      .get() as { count: number }

    return {
      total: total.count,
      current: current.count,
      historical: total.count - current.count,
    }
  }
}
