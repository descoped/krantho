/** A single numbered database migration */
export interface Migration {
  /** Monotonic version number: 1, 2, 3, ... */
  version: number
  /** Human-readable name: 'initial_tables', 'add_locale_column' */
  name: string
  /** Apply the migration. Must be idempotent within its transaction. */
  apply: MigrationApplyFn
}

/**
 * SQLite migrations receive a better-sqlite3 Database.
 * Postgres migrations receive a postgres.js Sql within a transaction.
 * Each adapter defines its own concrete type — this is the generic shape.
 */
export type MigrationApplyFn = (db: unknown) => void | Promise<void>

/** Record of an applied migration stored in schema_migrations */
export interface AppliedMigration {
  version: number
  name: string
  checksum: string
  appliedAt: string
}

/** Result of running the migration process */
export interface MigrationResult {
  /** Migrations that were applied in this run */
  applied: AppliedMigration[]
  /** Current schema version after migration */
  currentVersion: number
}

// --- Checkpoint System ---

/** Trigger that caused a checkpoint to be created */
export type CheckpointTrigger = 'manual' | 'pre-migration' | 'pre-restore' | 'pre-import'

/** Metadata for a checkpoint (lightweight timestamp marker) */
export interface CheckpointInfo {
  id: number
  version: number
  name: string | null
  trigger: CheckpointTrigger
  createdAt: string
}

/** Interface for checkpoint operations — point-in-time restore via is_current flags */
export interface ICheckpointAdapter {
  /** Create a checkpoint (records timestamp, no data copying) */
  createCheckpoint(
    name?: string | undefined,
    trigger?: CheckpointTrigger | undefined,
  ): Promise<CheckpointInfo>
  /** List all checkpoints (newest first) */
  listCheckpoints(): Promise<CheckpointInfo[]>
  /** Get a single checkpoint by version */
  getCheckpoint(version: number): Promise<CheckpointInfo | null>
  /** Restore to a checkpoint (rewinds is_current flags to checkpoint time) */
  restoreCheckpoint(version: number): Promise<CheckpointInfo>
  /** Delete a checkpoint */
  deleteCheckpoint(version: number): Promise<boolean>
}

// --- Content Migration ---

/** Content manifest file format (content/manifest.json) */
export interface ContentManifest {
  version: number
  /** The git commit the content was built from, when the build knew it */
  commit?: string | undefined
  generatedAt: string
  files: Record<string, { checksum: string; size: number }>
}

/** Record of an imported content manifest version */
export interface ContentManifestRecord {
  id: number
  repoVersion: number
  /** The git commit the imported content came from: the baseline a pull of production's edits starts at */
  repoCommit: string | null
  importedAt: string
  /** Each file's checksum as the database last took it from the repository, by path */
  fileChecksums: Record<string, string>
}

/** A content migration conflict */
export interface ContentConflict {
  id: number
  migrationId: number
  collection: string
  slug: string
  locale: string
  repoChecksum: string
  dbChecksum: string
  resolved: boolean
  resolvedAt: string | null
  resolution: 'keep_db' | 'use_repo' | 'merged' | null
}

/** Resolution for a content conflict */
export type ConflictResolution = 'keep_db' | 'use_repo'

/** Interface for content migration operations */
export interface IContentMigrationAdapter {
  /** Get the current content manifest version from DB */
  getContentManifestVersion(): Promise<number | null>
  /** Get the latest content manifest record */
  getContentManifest(): Promise<ContentManifestRecord | null>
  /** Save a new content manifest record */
  saveContentManifest(manifest: ContentManifestRecord): Promise<void>
  /** List unresolved content migration conflicts */
  listConflicts(): Promise<ContentConflict[]>
  /** Resolve a content migration conflict */
  resolveConflict(conflictId: number, resolution: ConflictResolution): Promise<boolean>
  /** Record a content migration conflict */
  recordConflict(
    conflict: Omit<ContentConflict, 'id' | 'resolved' | 'resolvedAt' | 'resolution'>,
  ): Promise<void>
}

/** Migration status returned by the API */
export interface MigrationStatus {
  /** Current physical schema version */
  schemaVersion: number
  /** Whether checkpoint system is available */
  checkpointEnabled: boolean
  /** Whether content migration system is available */
  contentMigrationEnabled: boolean
  /** Content manifest version in repo (null if no manifest) */
  repoContentVersion: number | null
  /** Content manifest version in DB (null if never imported) */
  dbContentVersion: number | null
  /** Number of unresolved content conflicts */
  unresolvedConflicts: number
}
