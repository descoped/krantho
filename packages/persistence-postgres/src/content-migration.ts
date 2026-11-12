import type {
  ConflictResolution,
  ContentConflict,
  ContentManifestRecord,
  IContentMigrationAdapter,
} from '@krantho/persistence'
import type { Sql } from 'postgres'

/** Postgres content migration adapter */
export class PostgresContentMigrationAdapter implements IContentMigrationAdapter {
  private readonly sql: Sql

  constructor(sql: Sql) {
    this.sql = sql
  }

  async getContentManifestVersion(): Promise<number | null> {
    const rows = (await this.sql.unsafe(
      'SELECT MAX(repo_version) as max_version FROM content_manifest',
    )) as Array<{ max_version: number | null }>

    return rows[0]?.max_version ?? null
  }

  async getContentManifest(): Promise<ContentManifestRecord | null> {
    const rows = (await this.sql.unsafe(
      'SELECT id, repo_version, repo_commit, imported_at, file_checksums FROM content_manifest ORDER BY id DESC LIMIT 1',
    )) as Array<{
      id: number
      repo_version: number
      repo_commit: string | null
      imported_at: Date
      file_checksums: Record<string, string>
    }>

    const row = rows[0]
    if (!row) return null

    return {
      id: row.id,
      repoVersion: row.repo_version,
      repoCommit: row.repo_commit,
      importedAt:
        row.imported_at instanceof Date ? row.imported_at.toISOString() : String(row.imported_at),
      fileChecksums: row.file_checksums,
    }
  }

  async saveContentManifest(manifest: ContentManifestRecord): Promise<void> {
    await this.sql.unsafe(
      'INSERT INTO content_manifest (repo_version, repo_commit, imported_at, file_checksums) VALUES ($1, $2, $3, $4)',
      // sql.json binds the object as JSONB; a JSON string would be stored as a string
      [
        manifest.repoVersion,
        manifest.repoCommit,
        manifest.importedAt,
        this.sql.json(manifest.fileChecksums),
      ],
    )
  }

  async listConflicts(): Promise<ContentConflict[]> {
    const rows = (await this.sql.unsafe(
      'SELECT id, migration_id, collection, slug, locale, repo_checksum, db_checksum, resolved, resolved_at, resolution FROM content_migration_conflicts WHERE resolved = FALSE ORDER BY id DESC',
    )) as Array<{
      id: number
      migration_id: number
      collection: string
      slug: string
      locale: string
      repo_checksum: string
      db_checksum: string
      resolved: boolean
      resolved_at: Date | null
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
      resolved: r.resolved,
      resolvedAt: r.resolved_at instanceof Date ? r.resolved_at.toISOString() : r.resolved_at,
      resolution: r.resolution as ConflictResolution | null,
    }))
  }

  async resolveConflict(conflictId: number, resolution: ConflictResolution): Promise<boolean> {
    const result = await this.sql.unsafe(
      'UPDATE content_migration_conflicts SET resolved = TRUE, resolved_at = NOW(), resolution = $1 WHERE id = $2 AND resolved = FALSE',
      [resolution, conflictId],
    )
    return (result as unknown as { count: number }).count > 0
  }

  async recordConflict(
    conflict: Omit<ContentConflict, 'id' | 'resolved' | 'resolvedAt' | 'resolution'>,
  ): Promise<void> {
    await this.sql.unsafe(
      'INSERT INTO content_migration_conflicts (migration_id, collection, slug, locale, repo_checksum, db_checksum) VALUES ($1, $2, $3, $4, $5, $6)',
      [
        conflict.migrationId,
        conflict.collection,
        conflict.slug,
        conflict.locale,
        conflict.repoChecksum,
        conflict.dbChecksum,
      ],
    )
  }
}
