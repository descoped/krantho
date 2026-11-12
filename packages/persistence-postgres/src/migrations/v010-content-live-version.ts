import type { PostgresMigration } from '../migration-runner.js'

/**
 * V010: live-version pointer on content rows.
 *
 * Every version row records `live_version` — the version of its document
 * that is live (published) as of that row, or NULL when nothing is live. The
 * document's live version is the current row's `live_version`, so a draft
 * saved on top of a published page leaves the page live, and restoring
 * `is_current` (checkpoints) restores the live version with it.
 *
 * Backfill: the latest published version at or before each row, unless a
 * deletion lies between the two. Tombstones get NULL.
 */
export const v010ContentLiveVersion: PostgresMigration = {
  version: 10,
  name: 'content_live_version',
  apply: async (sql) => {
    await sql.unsafe('ALTER TABLE content ADD COLUMN live_version INTEGER')
    await sql.unsafe(`
      UPDATE content c SET live_version = (
        SELECT MAX(p.version) FROM content p
        WHERE p.collection = c.collection
          AND p.slug = c.slug
          AND p.locale = c.locale
          AND p.status = 'published'
          AND p.version <= c.version
          AND NOT EXISTS (
            SELECT 1 FROM content d
            WHERE d.collection = c.collection
              AND d.slug = c.slug
              AND d.locale = c.locale
              AND d.status = 'deleted'
              AND d.version > p.version
              AND d.version <= c.version
          )
      )
      WHERE c.status <> 'deleted'
    `)
  },
}
