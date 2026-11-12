import type { IRetentionAdapter, PurgeResult } from '@krantho/persistence'
import type { Sql } from 'postgres'

interface VersionGroup {
  collection: string
  slug: string
  locale: string
  version_count: string
}

/** Postgres implementation of version retention/purge */
export class PostgresRetentionAdapter implements IRetentionAdapter {
  constructor(private readonly sql: Sql) {}

  async purgeVersions(maxVersionsPerItem: number): Promise<PurgeResult[]> {
    if (maxVersionsPerItem < 1) {
      throw new Error('maxVersionsPerItem must be at least 1')
    }

    // Find items with more versions than the limit
    const groups = await this.sql<VersionGroup[]>`
      SELECT collection, slug, locale, COUNT(*) as version_count
      FROM content
      WHERE deleted_at IS NULL
      GROUP BY collection, slug, locale
      HAVING COUNT(*) > ${maxVersionsPerItem}`

    const results: PurgeResult[] = []

    for (const group of groups) {
      const versionCount = parseInt(group.version_count, 10)
      const toPurge = versionCount - maxVersionsPerItem

      // Delete oldest non-current versions, never the one that is live. When the
      // live version is among the oldest, fewer rows go and the document stays
      // over the limit until later versions age out.
      const deleted = await this.sql.unsafe(
        `DELETE FROM content WHERE id IN (
          SELECT id FROM content
          WHERE collection = $1 AND slug = $2 AND locale = $3 AND is_current = FALSE
            AND version IS DISTINCT FROM (
              SELECT live_version FROM content
              WHERE collection = $1 AND slug = $2 AND locale = $3 AND is_current = TRUE
            )
          ORDER BY version ASC
          LIMIT $4
        )`,
        [group.collection, group.slug, group.locale, toPurge],
      )

      const changes = deleted.count
      if (changes > 0) {
        results.push({
          collection: group.collection,
          slug: group.slug,
          purged: changes,
          retained: versionCount - changes,
        })
      }
    }

    return results
  }

  async countVersions(): Promise<{ total: number; current: number; historical: number }> {
    const totalRows = await this.sql<{ count: string }[]>`
      SELECT COUNT(*) as count FROM content WHERE deleted_at IS NULL`
    const currentRows = await this.sql<{ count: string }[]>`
      SELECT COUNT(*) as count FROM content WHERE is_current = TRUE AND deleted_at IS NULL`

    const total = parseInt(totalRows[0]?.count ?? '0', 10)
    const current = parseInt(currentRows[0]?.count ?? '0', 10)

    return {
      total,
      current,
      historical: total - current,
    }
  }
}
