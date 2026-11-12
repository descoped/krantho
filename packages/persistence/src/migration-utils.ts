import type { AppliedMigration, ContentManifest } from './migrations.js'

/** Minimal migration identity — version + name, shared by all adapters */
export interface MigrationIdentity {
  version: number
  name: string
}

/**
 * Verify that already-applied migrations have not been modified.
 * Requires a checksum function injected by the caller (since node:crypto
 * is not available in the interface package).
 */
export function validateChecksums(
  migrations: readonly MigrationIdentity[],
  appliedMap: Map<number, { checksum: string }>,
  computeChecksum: (migration: MigrationIdentity) => string,
): void {
  for (const migration of migrations) {
    const existing = appliedMap.get(migration.version)
    if (!existing) continue

    const expectedChecksum = computeChecksum(migration)
    if (existing.checksum !== expectedChecksum) {
      throw new Error(
        `Migration V${migration.version} (${migration.name}) checksum mismatch. ` +
          `Expected ${expectedChecksum}, found ${existing.checksum}. ` +
          `Applied migrations must not be modified.`,
      )
    }
  }
}

/**
 * Determine the current schema version from applied and newly-applied migrations.
 */
export function resolveCurrentVersion(
  appliedVersions: Iterable<number>,
  newlyApplied: readonly AppliedMigration[],
): number {
  const allVersions = [...appliedVersions, ...newlyApplied.map((m) => m.version)]
  return allVersions.length > 0 ? Math.max(...allVersions) : 0
}

/**
 * Format a migration failure error message.
 */
export function migrationFailedMessage(version: number, name: string, err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  return (
    `Migration V${version} (${name}) failed: ${message}. ` +
    `Database has been rolled back to the state before this migration.`
  )
}

/** Content migration decision */
export type MigrationDecision =
  | { action: 'skip'; reason: string }
  | { action: 'full-import' }
  | { action: 'migrate'; repoVersion: number }

/** Determine what content migration action to take */
export function decideMigration(
  repoManifest: ContentManifest | null,
  dbVersion: number | null,
): MigrationDecision {
  if (!repoManifest) {
    return { action: 'skip', reason: 'No content manifest found in repo' }
  }

  if (dbVersion === null) {
    return { action: 'full-import' }
  }

  if (dbVersion >= repoManifest.version) {
    return {
      action: 'skip',
      reason: `DB version ${dbVersion} >= repo version ${repoManifest.version}`,
    }
  }

  return { action: 'migrate', repoVersion: repoManifest.version }
}
