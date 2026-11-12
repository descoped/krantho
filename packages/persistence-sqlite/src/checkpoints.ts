import type { CheckpointInfo, CheckpointTrigger, ICheckpointAdapter } from '@krantho/persistence'
import type Database from 'better-sqlite3'

interface CheckpointRow {
  id: number
  version: number
  name: string | null
  trigger: string
  created_at: string
}

function rowToCheckpointInfo(row: CheckpointRow): CheckpointInfo {
  return {
    id: row.id,
    version: row.version,
    name: row.name,
    trigger: row.trigger as CheckpointTrigger,
    createdAt: row.created_at,
  }
}

/**
 * SQLite checkpoint adapter.
 *
 * Checkpoints are lightweight timestamp markers. Creating a checkpoint
 * records the current timestamp. Restoring a checkpoint rewinds all
 * versioned tables to their state at that timestamp by flipping
 * `is_current` flags.
 */
export class SqliteCheckpointAdapter implements ICheckpointAdapter {
  private readonly db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  async createCheckpoint(name?: string, trigger?: CheckpointTrigger): Promise<CheckpointInfo> {
    const now = new Date().toISOString()
    const triggerValue = trigger ?? 'manual'

    const row = this.db.transaction(() => {
      // Allocate next version number
      const versionRow = this.db
        .prepare('UPDATE checkpoint_counter SET next = next + 1 RETURNING next - 1 as version')
        .get() as { version: number }

      const insertRow = this.db
        .prepare(
          'INSERT INTO checkpoints (version, name, trigger, created_at) VALUES (?, ?, ?, ?) RETURNING id',
        )
        .get(versionRow.version, name ?? null, triggerValue, now) as { id: number }

      return {
        id: insertRow.id,
        version: versionRow.version,
      }
    })()

    return {
      id: row.id,
      version: row.version,
      name: name ?? null,
      trigger: triggerValue,
      createdAt: now,
    }
  }

  async listCheckpoints(): Promise<CheckpointInfo[]> {
    const rows = this.db
      .prepare('SELECT * FROM checkpoints ORDER BY version DESC')
      .all() as CheckpointRow[]
    return rows.map(rowToCheckpointInfo)
  }

  async getCheckpoint(version: number): Promise<CheckpointInfo | null> {
    const row = this.db.prepare('SELECT * FROM checkpoints WHERE version = ?').get(version) as
      | CheckpointRow
      | undefined
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
    this.db.transaction(() => {
      // --- Content ---
      // Clear all current flags
      this.db.exec('UPDATE content SET is_current = 0 WHERE is_current = 1')
      // Re-activate the latest version of each entity that existed at checkpoint time
      this.db
        .prepare(
          `UPDATE content SET is_current = 1
           WHERE id IN (
             SELECT id FROM (
               SELECT id, collection, slug, locale, created_at,
                 ROW_NUMBER() OVER (PARTITION BY collection, slug, locale ORDER BY version DESC) as rn
               FROM content
               WHERE created_at <= ?
                 AND (deleted_at IS NULL OR deleted_at > ?)
             ) WHERE rn = 1
           )`,
        )
        .run(timestamp, timestamp)

      // --- Collection schemas ---
      this.db.exec('UPDATE collection_schemas SET is_current = 0 WHERE is_current = 1')
      this.db
        .prepare(
          `UPDATE collection_schemas SET is_current = 1
           WHERE row_id IN (
             SELECT row_id FROM (
               SELECT row_id, collection,
                 ROW_NUMBER() OVER (PARTITION BY collection ORDER BY version DESC) as rn
               FROM collection_schemas
               WHERE created_at <= ?
                 AND (deleted_at IS NULL OR deleted_at > ?)
             ) WHERE rn = 1
           )`,
        )
        .run(timestamp, timestamp)

      // --- Media ---
      this.db.exec('UPDATE media SET is_current = 0 WHERE is_current = 1')
      this.db
        .prepare(
          `UPDATE media SET is_current = 1
           WHERE row_id IN (
             SELECT row_id FROM (
               SELECT row_id, id,
                 ROW_NUMBER() OVER (PARTITION BY id ORDER BY version DESC) as rn
               FROM media
               WHERE created_at <= ?
                 AND (deleted_at IS NULL OR deleted_at > ?)
             ) WHERE rn = 1
           )`,
        )
        .run(timestamp, timestamp)
    })()

    return checkpoint
  }

  async deleteCheckpoint(version: number): Promise<boolean> {
    const result = this.db.prepare('DELETE FROM checkpoints WHERE version = ?').run(version)
    return result.changes > 0
  }
}
