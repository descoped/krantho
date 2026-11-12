import { createHash } from 'node:crypto'
import type {
  ConflictResolution,
  ContentConflict,
  ContentManifestRecord,
  IContentMigrationAdapter,
} from '@krantho/persistence'
import type Database from 'better-sqlite3'

/** SQLite content migration adapter */
export class SqliteContentMigrationAdapter implements IContentMigrationAdapter {
  private readonly db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  async getContentManifestVersion(): Promise<number | null> {
    const row = this.db
      .prepare('SELECT MAX(repo_version) as max_version FROM content_manifest')
      .get() as { max_version: number | null } | undefined

    return row?.max_version ?? null
  }

  async getContentManifest(): Promise<ContentManifestRecord | null> {
    const row = this.db
      .prepare(
        'SELECT id, repo_version, repo_commit, imported_at, file_checksums FROM content_manifest ORDER BY id DESC LIMIT 1',
      )
      .get() as
      | {
          id: number
          repo_version: number
          repo_commit: string | null
          imported_at: string
          file_checksums: string
        }
      | undefined

    if (!row) return null

    return {
      id: row.id,
      repoVersion: row.repo_version,
      repoCommit: row.repo_commit,
      importedAt: row.imported_at,
      fileChecksums: JSON.parse(row.file_checksums) as Record<string, string>,
    }
  }

  async saveContentManifest(manifest: ContentManifestRecord): Promise<void> {
    this.db
      .prepare(
        'INSERT INTO content_manifest (repo_version, repo_commit, imported_at, file_checksums) VALUES (?, ?, ?, ?)',
      )
      .run(
        manifest.repoVersion,
        manifest.repoCommit,
        manifest.importedAt,
        JSON.stringify(manifest.fileChecksums),
      )
  }

  async listConflicts(): Promise<ContentConflict[]> {
    const rows = this.db
      .prepare(
        'SELECT id, migration_id, collection, slug, locale, repo_checksum, db_checksum, resolved, resolved_at, resolution FROM content_migration_conflicts WHERE resolved = 0 ORDER BY id DESC',
      )
      .all() as Array<{
      id: number
      migration_id: number
      collection: string
      slug: string
      locale: string
      repo_checksum: string
      db_checksum: string
      resolved: number
      resolved_at: string | null
      resolution: string | null
    }>

    return rows.map((r) => ({
      id: r.id,
      migrationId: r.migration_id,
      collection: r.collection,
      slug: r.slug,
      locale: r.locale,
      repoChecksum: r.repo_checksum,
      dbChecksum: r.db_checksum,
      resolved: r.resolved === 1,
      resolvedAt: r.resolved_at,
      resolution: r.resolution as ConflictResolution | null,
    }))
  }

  async resolveConflict(conflictId: number, resolution: ConflictResolution): Promise<boolean> {
    const result = this.db
      .prepare(
        'UPDATE content_migration_conflicts SET resolved = 1, resolved_at = ?, resolution = ? WHERE id = ? AND resolved = 0',
      )
      .run(new Date().toISOString(), resolution, conflictId)

    return result.changes > 0
  }

  async recordConflict(
    conflict: Omit<ContentConflict, 'id' | 'resolved' | 'resolvedAt' | 'resolution'>,
  ): Promise<void> {
    this.db
      .prepare(
        'INSERT INTO content_migration_conflicts (migration_id, collection, slug, locale, repo_checksum, db_checksum) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(
        conflict.migrationId,
        conflict.collection,
        conflict.slug,
        conflict.locale,
        conflict.repoChecksum,
        conflict.dbChecksum,
      )
  }
}

/** Compute SHA-256 checksum of content string */
export function computeContentChecksum(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

export type { MigrationDecision } from '@krantho/persistence'
// Re-export shared content migration utilities for backward compatibility
export { decideMigration } from '@krantho/persistence'
