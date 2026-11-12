import type { PostgresMigration } from '../migration-runner.js'

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
export const v004MediaHotspot: PostgresMigration = {
  version: 4,
  name: 'media_hotspot',
  apply: async (sql) => {
    const tables = await sql.unsafe<Array<{ table_name: string }>>(
      `SELECT table_name FROM information_schema.tables WHERE table_name = 'media' AND table_schema = current_schema()`,
    )
    if (tables.length === 0) return

    const cols = await sql.unsafe<Array<{ column_name: string }>>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'media' AND column_name = 'hotspot'`,
    )
    if (cols.length > 0) return
    await sql.unsafe(`ALTER TABLE media ADD COLUMN hotspot JSONB DEFAULT NULL`)
  },
}
