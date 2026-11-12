import { documentSeoRow } from '@krantho/persistence'
import type { PostgresMigration } from '../migration-runner.js'

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
export const v013ContentContracts: PostgresMigration = {
  version: 13,
  name: 'content_contracts',
  apply: async (sql) => {
    await sql.unsafe(
      `ALTER TABLE content ADD COLUMN authored JSONB NOT NULL DEFAULT '{"metadata":{},"contract":null,"defaults":[],"repositoryBasis":null}'`,
    )
    await sql.unsafe(
      `ALTER TABLE collection_schemas ADD COLUMN metadata_groups JSONB NOT NULL DEFAULT '[]'`,
    )
    await sql.unsafe(
      `ALTER TABLE content_migration_conflicts ADD COLUMN locale TEXT NOT NULL DEFAULT ''`,
    )
    await sql.unsafe(`
      UPDATE content_migration_conflicts m SET locale = COALESCE((
        SELECT c.locale FROM content c
        WHERE c.collection = m.collection AND c.slug = m.slug
        ORDER BY c.created_at, c.version LIMIT 1
      ), '')
    `)
    const rows = (await sql.unsafe(
      `SELECT id, config FROM seo_config WHERE scope = 'document'`,
    )) as Array<{ id: string; config: unknown }>
    for (const row of rows) {
      const moved = documentSeoRow(row.id, row.config)
      if (!moved) continue
      await sql`UPDATE content SET authored = jsonb_set(authored, '{metadata,seo}', ${sql.json(moved.config as never)})
        WHERE collection = ${moved.collection} AND slug = ${moved.slug}`
      await sql.unsafe('DELETE FROM seo_config WHERE id = $1', [row.id])
    }
  },
}
