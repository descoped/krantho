import { documentSeoRow } from '@krantho/persistence'
import type { SqliteMigration } from '../migration-runner.js'

/**
 * V013: content contracts — authored metadata on content rows, metadata groups
 * on runtime schemas, and the locale of a repository import conflict.
 *
 * `content.authored` holds `{ metadata, contract, defaults, repositoryBasis }`
 * (`AuthoredMetadata` in `@krantho/persistence`); rows written before it have
 * no metadata and no contract. A conflict recorded before conflicts had a
 * locale takes the locale of the document's first version.
 *
 * A document's own SEO moves from `seo_config` into its metadata: every version
 * of the document gets the config as `metadata.seo`, as it applied to all of
 * them before, and the `doc:` rows are removed. A config that is not an object
 * (null, or text that does not parse) is left in place, and nothing is lost.
 */
export const v013ContentContracts: SqliteMigration = {
  version: 13,
  name: 'content_contracts',
  apply: (db) => {
    db.exec(
      `ALTER TABLE content ADD COLUMN authored TEXT NOT NULL DEFAULT '{"metadata":{},"contract":null,"defaults":[],"repositoryBasis":null}'`,
    )
    db.exec(`ALTER TABLE collection_schemas ADD COLUMN metadata_groups TEXT NOT NULL DEFAULT '[]'`)
    db.exec(`ALTER TABLE content_migration_conflicts ADD COLUMN locale TEXT NOT NULL DEFAULT ''`)
    db.exec(`
      UPDATE content_migration_conflicts SET locale = COALESCE((
        SELECT c.locale FROM content c
        WHERE c.collection = content_migration_conflicts.collection
          AND c.slug = content_migration_conflicts.slug
        ORDER BY c.created_at, c.version LIMIT 1
      ), '')
    `)
    const rows = db
      .prepare(`SELECT id, config FROM seo_config WHERE scope = 'document'`)
      .all() as Array<{ id: string; config: string | null }>
    const copy = db.prepare(
      `UPDATE content SET authored = json_set(authored, '$.metadata.seo', json(?))
       WHERE collection = ? AND slug = ?`,
    )
    const remove = db.prepare('DELETE FROM seo_config WHERE id = ?')
    for (const row of rows) {
      const moved = documentSeoRow(row.id, row.config)
      if (!moved) continue
      copy.run(JSON.stringify(moved.config), moved.collection, moved.slug)
      remove.run(row.id)
    }
  },
}
