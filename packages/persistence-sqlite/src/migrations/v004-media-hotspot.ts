import type { SqliteMigration } from '../migration-runner.js'

/**
 * V004: Add hotspot column to media table.
 *
 * Stores a JSON-encoded hotspot (center + ellipse) for adaptive
 * aspect-ratio cropping. NULL means no hotspot defined.
 *
 * It ran before the `media` table was part of the migrated schema, so it is a
 * no-op when the table is missing. It stays because applied migrations form
 * the numbered ledger (the checksum covers only `version:name`); v011 creates
 * `media` with the hotspot column.
 */
export const v004MediaHotspot: SqliteMigration = {
  version: 4,
  name: 'media_hotspot',
  apply: (db) => {
    const columns = db.pragma('table_info(media)') as Array<{ name: string }>
    if (columns.length === 0) return
    if (columns.some((c) => c.name === 'hotspot')) return
    db.exec('ALTER TABLE media ADD COLUMN hotspot TEXT DEFAULT NULL')
  },
}
