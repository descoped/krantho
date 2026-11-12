import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  computeContentChecksum,
  decideMigration,
  SqliteContentMigrationAdapter,
} from '../src/content-migration.js'
import { runMigrations } from '../src/migration-runner.js'
import { sqliteMigrations } from '../src/migrations/index.js'

let db: Database.Database
let migration: SqliteContentMigrationAdapter

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db, sqliteMigrations)
  migration = new SqliteContentMigrationAdapter(db)
})

afterEach(() => {
  db.close()
})

describe('SqliteContentMigrationAdapter', () => {
  describe('getContentManifestVersion', () => {
    it('returns null when no manifest exists', async () => {
      const version = await migration.getContentManifestVersion()
      expect(version).toBeNull()
    })

    it('returns latest version', async () => {
      await migration.saveContentManifest({
        id: 0,
        repoVersion: 1,
        repoCommit: null,
        importedAt: new Date().toISOString(),
        fileChecksums: { 'pages/home.md': 'abc123' },
      })
      await migration.saveContentManifest({
        id: 0,
        repoVersion: 3,
        repoCommit: null,
        importedAt: new Date().toISOString(),
        fileChecksums: { 'pages/home.md': 'def456' },
      })

      const version = await migration.getContentManifestVersion()
      expect(version).toBe(3)
    })
  })

  describe('getContentManifest', () => {
    it('returns null when no manifest exists', async () => {
      const manifest = await migration.getContentManifest()
      expect(manifest).toBeNull()
    })

    it('keeps the commit the content came from, and none when the build knew none', async () => {
      const commit = 'a'.repeat(40)
      await migration.saveContentManifest({
        id: 0,
        repoVersion: 1,
        repoCommit: null,
        importedAt: '2026-01-01T00:00:00Z',
        fileChecksums: {},
      })
      expect((await migration.getContentManifest())?.repoCommit).toBeNull()
      await migration.saveContentManifest({
        id: 0,
        repoVersion: 2,
        repoCommit: commit,
        importedAt: '2026-01-02T00:00:00Z',
        fileChecksums: {},
      })
      expect((await migration.getContentManifest())?.repoCommit).toBe(commit)
    })

    it('returns latest manifest', async () => {
      await migration.saveContentManifest({
        id: 0,
        repoVersion: 1,
        repoCommit: null,
        importedAt: '2026-01-01T00:00:00Z',
        fileChecksums: { 'pages/home.md': 'abc' },
      })

      const manifest = await migration.getContentManifest()
      expect(manifest).not.toBeNull()
      expect(manifest!.repoVersion).toBe(1)
      expect(manifest!.fileChecksums).toEqual({ 'pages/home.md': 'abc' })
    })
  })

  describe('conflicts', () => {
    it('records and lists conflicts', async () => {
      await migration.recordConflict({
        migrationId: 1,
        collection: 'pages',
        slug: 'home',
        locale: 'en',
        repoChecksum: 'repo-abc',
        dbChecksum: 'db-xyz',
      })

      const conflicts = await migration.listConflicts()
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0]!.collection).toBe('pages')
      expect(conflicts[0]!.slug).toBe('home')
      expect(conflicts[0]!.resolved).toBe(false)
    })

    it('resolves a conflict', async () => {
      await migration.recordConflict({
        migrationId: 1,
        collection: 'pages',
        slug: 'home',
        locale: 'en',
        repoChecksum: 'repo-abc',
        dbChecksum: 'db-xyz',
      })

      const conflicts = await migration.listConflicts()
      const resolved = await migration.resolveConflict(conflicts[0]!.id, 'keep_db')
      expect(resolved).toBe(true)

      // Should no longer appear in unresolved list
      const remaining = await migration.listConflicts()
      expect(remaining).toHaveLength(0)
    })

    it('returns false for nonexistent conflict', async () => {
      const resolved = await migration.resolveConflict(999, 'keep_db')
      expect(resolved).toBe(false)
    })
  })
})

describe('computeContentChecksum', () => {
  it('returns consistent SHA-256 hex', () => {
    const hash1 = computeContentChecksum('hello world')
    const hash2 = computeContentChecksum('hello world')
    expect(hash1).toBe(hash2)
    expect(hash1).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns different checksums for different content', () => {
    const hash1 = computeContentChecksum('hello')
    const hash2 = computeContentChecksum('world')
    expect(hash1).not.toBe(hash2)
  })
})

describe('decideMigration', () => {
  it('skips when no manifest exists', () => {
    const decision = decideMigration(null, null)
    expect(decision.action).toBe('skip')
  })

  it('full imports when DB has no version', () => {
    const decision = decideMigration({ version: 1, generatedAt: '', files: {} }, null)
    expect(decision.action).toBe('full-import')
  })

  it('skips when DB version >= repo version', () => {
    const decision = decideMigration({ version: 2, generatedAt: '', files: {} }, 3)
    expect(decision.action).toBe('skip')
  })

  it('migrates when repo version > DB version', () => {
    const decision = decideMigration({ version: 3, generatedAt: '', files: {} }, 2)
    expect(decision).toEqual({ action: 'migrate', repoVersion: 3 })
  })
})
