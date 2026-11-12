import type { SqliteMigration } from '../migration-runner.js'

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
export const v010ContentLiveVersion: SqliteMigration = {
  version: 10,
  name: 'content_live_version',
  apply: (db) => {
    db.exec('ALTER TABLE content ADD COLUMN live_version INTEGER')
    db.exec(`
      UPDATE content SET live_version = (
        SELECT MAX(p.version) FROM content p
        WHERE p.collection = content.collection
          AND p.slug = content.slug
          AND p.locale = content.locale
          AND p.status = 'published'
          AND p.version <= content.version
          AND NOT EXISTS (
            SELECT 1 FROM content d
            WHERE d.collection = content.collection
              AND d.slug = content.slug
              AND d.locale = content.locale
              AND d.status = 'deleted'
              AND d.version > p.version
              AND d.version <= content.version
          )
      )
      WHERE status <> 'deleted'
    `)
  },
}
