import type { CheckpointInfo, CheckpointTrigger, ICheckpointAdapter } from '@krantho/persistence'
import type { Sql } from 'postgres'

interface CheckpointRow {
  id: number
  version: number
  name: string | null
  trigger: string
  created_at: Date
}

function rowToCheckpointInfo(row: CheckpointRow): CheckpointInfo {
  return {
    id: row.id,
    version: row.version,
    name: row.name,
    trigger: row.trigger as CheckpointTrigger,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  }
}

/**
 * Postgres checkpoint adapter.
 *
 * Checkpoints are lightweight timestamp markers. Creating a checkpoint
 * records the current timestamp. Restoring a checkpoint rewinds all
 * versioned tables to their state at that timestamp by flipping
 * `is_current` flags.
 */
export class PostgresCheckpointAdapter implements ICheckpointAdapter {
  constructor(private readonly sql: Sql) {}

  async createCheckpoint(name?: string, trigger?: CheckpointTrigger): Promise<CheckpointInfo> {
    const now = new Date().toISOString()
    const triggerValue = trigger ?? 'manual'

    // Allocate next version number and insert checkpoint in a transaction
    const result = await this.sql.begin(async (tx) => {
      const versionRows = (await tx.unsafe(
        'UPDATE checkpoint_counter SET next = next + 1 RETURNING next - 1 as version',
      )) as Array<{ version: number }>
      const version = versionRows[0]!.version

      const insertRows = (await tx.unsafe(
        'INSERT INTO checkpoints (version, name, trigger, created_at) VALUES ($1, $2, $3, $4) RETURNING id',
        [version, name ?? null, triggerValue, now],
      )) as Array<{ id: number }>

      return { id: insertRows[0]!.id, version }
    })

    return {
      id: result.id,
      version: result.version,
      name: name ?? null,
      trigger: triggerValue,
      createdAt: now,
    }
  }

  async listCheckpoints(): Promise<CheckpointInfo[]> {
    const rows = await this.sql<CheckpointRow[]>`
      SELECT * FROM checkpoints ORDER BY version DESC`
    return rows.map(rowToCheckpointInfo)
  }

  async getCheckpoint(version: number): Promise<CheckpointInfo | null> {
    const rows = await this.sql<CheckpointRow[]>`
      SELECT * FROM checkpoints WHERE version = ${version}`
    const row = rows[0]
    return row ? rowToCheckpointInfo(row) : null
  }

  async restoreCheckpoint(version: number): Promise<CheckpointInfo> {
    const checkpoint = await this.getCheckpoint(version)
    if (!checkpoint) {
      throw new Error(`Checkpoint version ${version} not found`)
    }

    // Create pre-restore checkpoint first
    await this.createCheckpoint(`pre-restore-v${version}`, 'pre-restore')

    const timestamp = checkpoint.createdAt

    // Restore all versioned tables to their state at checkpoint time
    await this.sql.begin(async (tx) => {
      // --- Content ---
      // Clear all current flags
      await tx.unsafe('UPDATE content SET is_current = FALSE WHERE is_current = TRUE')
      // Re-activate the latest version of each entity that existed at checkpoint time
      await tx.unsafe(
        `UPDATE content SET is_current = TRUE
         WHERE id IN (
           SELECT id FROM (
             SELECT id, collection, slug, locale, created_at,
               ROW_NUMBER() OVER (PARTITION BY collection, slug, locale ORDER BY version DESC) as rn
             FROM content
             WHERE created_at <= $1
               AND (deleted_at IS NULL OR deleted_at > $1)
           ) sub WHERE rn = 1
         )`,
        [timestamp],
      )

      // --- Collection schemas ---
      await tx.unsafe('UPDATE collection_schemas SET is_current = FALSE WHERE is_current = TRUE')
      await tx.unsafe(
        `UPDATE collection_schemas SET is_current = TRUE
         WHERE row_id IN (
           SELECT row_id FROM (
             SELECT row_id, collection,
               ROW_NUMBER() OVER (PARTITION BY collection ORDER BY version DESC) as rn
             FROM collection_schemas
             WHERE created_at <= $1
               AND (deleted_at IS NULL OR deleted_at > $1)
           ) sub WHERE rn = 1
         )`,
        [timestamp],
      )

      // --- Media ---
      await tx.unsafe('UPDATE media SET is_current = FALSE WHERE is_current = TRUE')
      await tx.unsafe(
        `UPDATE media SET is_current = TRUE
         WHERE row_id IN (
           SELECT row_id FROM (
             SELECT row_id, id,
               ROW_NUMBER() OVER (PARTITION BY id ORDER BY version DESC) as rn
             FROM media
             WHERE created_at <= $1
               AND (deleted_at IS NULL OR deleted_at > $1)
           ) sub WHERE rn = 1
         )`,
        [timestamp],
      )
    })

    return checkpoint
  }

  async deleteCheckpoint(version: number): Promise<boolean> {
    const result = await this.sql`
      DELETE FROM checkpoints WHERE version = ${version}`
    return result.count > 0
  }
}
