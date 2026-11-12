import { createHash } from 'node:crypto'
import type { AppliedMigration, MigrationIdentity, MigrationResult } from '@krantho/persistence'
import {
  migrationFailedMessage,
  resolveCurrentVersion,
  validateChecksums,
} from '@krantho/persistence'
import type { Sql, TransactionSql } from 'postgres'

/** A Postgres migration with async apply function */
export interface PostgresMigration {
  version: number
  name: string
  apply: (sql: TransactionSql) => Promise<void>
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
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`

/**
 * Advisory lock key that serializes migration runs across processes. A fixed
 * value — the ASCII bytes of "krantho" — so every krantho process sharing a
 * database contends for the same lock.
 */
const MIGRATION_LOCK_KEY = '30224656064259183'

type MigrationRow = { version: number; name: string; checksum: string; applied_at: Date }

/** Read the applied-migration ledger, or null when it has not been created yet */
async function readLedger(sql: Sql | TransactionSql): Promise<Map<number, MigrationRow> | null> {
  try {
    const rows = await sql<MigrationRow[]>`
      SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version`
    return new Map(rows.map((m) => [m.version, m]))
  } catch (err: unknown) {
    if (isUndefinedTable(err)) return null
    throw err
  }
}

/** Apply every pending migration. Must run inside the transaction holding the migration lock. */
async function applyPending(
  tx: TransactionSql,
  migrations: readonly PostgresMigration[],
): Promise<MigrationResult> {
  await tx.unsafe(CREATE_SCHEMA_MIGRATIONS)
  const ledger = (await readLedger(tx)) ?? new Map<number, MigrationRow>()
  validateChecksums(migrations, ledger, computeChecksum)

  const newlyApplied: AppliedMigration[] = []

  for (const migration of [...migrations].sort((a, b) => a.version - b.version)) {
    if (ledger.has(migration.version)) continue

    const checksum = computeChecksum(migration)
    const appliedAt = new Date().toISOString()
    try {
      await migration.apply(tx)
      await tx.unsafe(
        'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES ($1, $2, $3, $4)',
        [migration.version, migration.name, checksum, appliedAt],
      )
    } catch (err) {
      throw new Error(migrationFailedMessage(migration.version, migration.name, err))
    }
    newlyApplied.push({ version: migration.version, name: migration.name, checksum, appliedAt })
  }

  return {
    applied: newlyApplied,
    currentVersion: resolveCurrentVersion(ledger.keys(), newlyApplied),
  }
}

/**
 * Run pending migrations on a Postgres database.
 *
 * Self-bootstrapping: creates the schema_migrations table if it doesn't exist.
 * All pending migrations run in one transaction. Halts on first failure, which
 * rolls back the whole run.
 *
 * Deciding what is pending and applying it is a check-then-act, so it runs while
 * holding a transaction-scoped advisory lock: the lock is taken before the ledger
 * is read and released when the last migration commits. Serverless platforms
 * cold-start several instances against the same database at once, and without
 * the lock they all read an empty ledger and race to create the same tables. A
 * losing instance waits on the lock and then re-reads the ledger inside it,
 * finding the work already done.
 */
export async function runMigrations(
  sql: Sql,
  migrations: readonly PostgresMigration[],
): Promise<MigrationResult> {
  // Fast path — an already-migrated database is the common case, and reading the
  // ledger without the lock is safe because "every migration is applied" is a
  // state no concurrent migration run can take away.
  const ledger = await readLedger(sql)
  if (ledger) {
    validateChecksums(migrations, ledger, computeChecksum)
    if (migrations.every((m) => ledger.has(m.version))) {
      return { applied: [], currentVersion: resolveCurrentVersion(ledger.keys(), []) }
    }
  }

  return sql.begin(async (tx) => {
    await tx.unsafe(`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK_KEY})`)
    return applyPending(tx, migrations)
  })
}

/** Get the current schema version from the database */
export async function getSchemaVersion(sql: Sql): Promise<number> {
  try {
    const rows = await sql<Array<{ max_version: number | null }>>`
      SELECT MAX(version) as max_version FROM schema_migrations`
    return rows[0]?.max_version ?? 0
  } catch (err: unknown) {
    // 42P01 = "relation does not exist" — table not created yet
    if (isUndefinedTable(err)) return 0
    throw err
  }
}

/** Get all applied migrations */
export async function getAppliedMigrations(sql: Sql): Promise<AppliedMigration[]> {
  const ledger = await readLedger(sql)
  if (!ledger) return []

  return [...ledger.values()].map((r) => ({
    version: r.version,
    name: r.name,
    checksum: r.checksum,
    appliedAt: r.applied_at instanceof Date ? r.applied_at.toISOString() : String(r.applied_at),
  }))
}

/** Check if a Postgres error is "relation does not exist" (42P01) */
function isUndefinedTable(err: unknown): boolean {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    return (err as { code: string }).code === '42P01'
  }
  return false
}
