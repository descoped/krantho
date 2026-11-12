import { createHash } from 'node:crypto'
import type { AppliedMigration, MigrationIdentity, MigrationResult } from '@krantho/persistence'
import {
  migrationFailedMessage,
  resolveCurrentVersion,
  validateChecksums,
} from '@krantho/persistence'
import type Database from 'better-sqlite3'

/** A SQLite migration with synchronous apply function */
export interface SqliteMigration {
  version: number
  name: string
  apply: (db: Database.Database) => void
}

/** Compute SHA-256 checksum of a migration's identity */
function computeChecksum(migration: MigrationIdentity): string {
  const content = `v${migration.version}:${migration.name}`
  return createHash('sha256').update(content).digest('hex')
}

const CREATE_SCHEMA_MIGRATIONS = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
)`

type MigrationRow = { version: number; name: string; checksum: string; applied_at: string }

/** Read the applied-migration ledger, or null when it has not been created yet */
function readLedger(db: Database.Database): Map<number, MigrationRow> | null {
  const tableExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'")
    .get() as { name: string } | undefined

  if (!tableExists) return null

  const rows = db
    .prepare('SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version')
    .all() as MigrationRow[]

  return new Map(rows.map((m) => [m.version, m]))
}

/** Apply one migration and record it, rolling back that migration alone on failure */
function applyMigration(
  db: Database.Database,
  migration: SqliteMigration,
  checksum: string,
  appliedAt: string,
): void {
  const run = db.transaction(() => {
    migration.apply(db)
    db.prepare(
      'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
    ).run(migration.version, migration.name, checksum, appliedAt)
  })

  try {
    run()
  } catch (err) {
    throw new Error(migrationFailedMessage(migration.version, migration.name, err))
  }
}

/** Apply every pending migration. Must run while holding the database write lock. */
function applyPending(
  db: Database.Database,
  migrations: readonly SqliteMigration[],
): MigrationResult {
  db.exec(CREATE_SCHEMA_MIGRATIONS)
  const ledger = readLedger(db) ?? new Map<number, MigrationRow>()
  validateChecksums(migrations, ledger, computeChecksum)

  const newlyApplied: AppliedMigration[] = []

  for (const migration of [...migrations].sort((a, b) => a.version - b.version)) {
    if (ledger.has(migration.version)) continue

    const checksum = computeChecksum(migration)
    const appliedAt = new Date().toISOString()
    applyMigration(db, migration, checksum, appliedAt)
    newlyApplied.push({ version: migration.version, name: migration.name, checksum, appliedAt })
  }

  return {
    applied: newlyApplied,
    currentVersion: resolveCurrentVersion(ledger.keys(), newlyApplied),
  }
}

/**
 * Run pending migrations on a SQLite database.
 *
 * Self-bootstrapping: creates the schema_migrations table if it doesn't exist.
 * Each migration runs inside a transaction. Halts on first failure.
 *
 * Deciding what is pending and applying it is a check-then-act, so it runs inside
 * a BEGIN IMMEDIATE transaction: the write lock is taken before the ledger is read
 * and held until the last migration is recorded. Several processes may open the
 * same database file at once — a server, a CLI, a framework spawning one build
 * worker per core — and without the lock they all read an empty ledger and race to
 * create the same tables. The loser waits on the connection's busy timeout and then
 * re-reads the ledger inside the lock, finding the work already done.
 */
export function runMigrations(
  db: Database.Database,
  migrations: readonly SqliteMigration[],
): MigrationResult {
  // Fast path — an already-migrated database is the common case, and reading the
  // ledger without the write lock is safe because "every migration is applied" is
  // a state no concurrent migration run can take away.
  const ledger = readLedger(db)
  if (ledger) {
    validateChecksums(migrations, ledger, computeChecksum)
    if (migrations.every((m) => ledger.has(m.version))) {
      return { applied: [], currentVersion: resolveCurrentVersion(ledger.keys(), []) }
    }
  }

  return db.transaction(() => applyPending(db, migrations)).immediate()
}

/** Get the current schema version from the database */
export function getSchemaVersion(db: Database.Database): number {
  // Check if schema_migrations table exists
  const tableExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'")
    .get() as { name: string } | undefined

  if (!tableExists) return 0

  const row = db.prepare('SELECT MAX(version) as max_version FROM schema_migrations').get() as
    | { max_version: number | null }
    | undefined

  return row?.max_version ?? 0
}

/** Get all applied migrations */
export function getAppliedMigrations(db: Database.Database): AppliedMigration[] {
  const ledger = readLedger(db)
  if (!ledger) return []

  return [...ledger.values()].map((r) => ({
    version: r.version,
    name: r.name,
    checksum: r.checksum,
    appliedAt: r.applied_at,
  }))
}
