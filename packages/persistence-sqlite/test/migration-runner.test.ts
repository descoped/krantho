import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SqliteMigration } from '../src/migration-runner.js'
import { getAppliedMigrations, getSchemaVersion, runMigrations } from '../src/migration-runner.js'
import { sqliteMigrations } from '../src/migrations/index.js'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
})

afterEach(() => {
  db.close()
})

describe('runMigrations', () => {
  it('bootstraps schema_migrations table and applies all migrations', () => {
    const result = runMigrations(db, sqliteMigrations)

    expect(result.applied.length).toBe(sqliteMigrations.length)
    expect(result.currentVersion).toBe(14)

    // Verify tables exist
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>
    const tableNames = tables.map((t) => t.name)
    expect(tableNames).toContain('content')
    expect(tableNames).toContain('collection_schemas')
    expect(tableNames).toContain('schema_migrations')
    expect(tableNames).toContain('checkpoints')
    expect(tableNames).toContain('checkpoint_counter')
    expect(tableNames).toContain('content_manifest')
    expect(tableNames).toContain('content_migration_conflicts')
    expect(tableNames).toContain('users')
    expect(tableNames).toContain('refresh_tokens')
    expect(tableNames).toContain('user_permissions')
    expect(tableNames).toContain('content_locks')
    expect(tableNames).toContain('webhook_deliveries')
    expect(tableNames).toContain('media_folders')
    expect(tableNames).toContain('site_settings')
    expect(tableNames).toContain('seo_config')
    expect(tableNames).toContain('media')
    expect(tableNames).toContain('page_cache_entries')
    expect(tableNames).toContain('page_cache_tags')
  })

  it('is idempotent — running twice applies nothing the second time', () => {
    runMigrations(db, sqliteMigrations)
    const result = runMigrations(db, sqliteMigrations)

    expect(result.applied).toHaveLength(0)
    expect(result.currentVersion).toBe(14)
  })

  it('applies only pending migrations', () => {
    // Run first two
    const first = [sqliteMigrations[0]!, sqliteMigrations[1]!]
    const result1 = runMigrations(db, first)
    expect(result1.applied).toHaveLength(2)
    expect(result1.currentVersion).toBe(2)

    // Run all — remaining migrations should be applied
    const result2 = runMigrations(db, sqliteMigrations)
    expect(result2.applied).toHaveLength(12)
    expect(result2.applied[0]!.version).toBe(3)
    expect(result2.applied[11]!.version).toBe(14)
    expect(result2.currentVersion).toBe(14)
  })

  it('detects checksum mismatch on already-applied migration', () => {
    runMigrations(db, sqliteMigrations)

    // Tamper with V001 by changing its name (checksum is based on version + name)
    const tampered: SqliteMigration = {
      version: 1,
      name: 'tampered_tables',
      apply: (d) => {
        d.exec('SELECT 1')
      },
    }

    expect(() => runMigrations(db, [tampered])).toThrow('checksum mismatch')
  })

  it('rolls back on migration failure', () => {
    const badMigration: SqliteMigration = {
      version: 1,
      name: 'will_fail',
      apply: (d) => {
        d.exec('CREATE TABLE good_table (id INTEGER)')
        d.exec('INVALID SQL SYNTAX HERE')
      },
    }

    expect(() => runMigrations(db, [badMigration])).toThrow('failed')

    // good_table should not exist (rolled back)
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='good_table'")
      .all()
    expect(tables).toHaveLength(0)

    // No migration recorded
    expect(getSchemaVersion(db)).toBe(0)
  })

  it('records checksums and timestamps', () => {
    runMigrations(db, sqliteMigrations)
    const applied = getAppliedMigrations(db)

    expect(applied).toHaveLength(14)
    for (const m of applied) {
      expect(m.checksum).toMatch(/^[0-9a-f]{64}$/)
      expect(m.appliedAt).toMatch(/^\d{4}-\d{2}-\d{2}/)
    }
  })
})

describe('getSchemaVersion', () => {
  it('returns 0 when no migrations applied', () => {
    expect(getSchemaVersion(db)).toBe(0)
  })

  it('returns highest version after migrations', () => {
    runMigrations(db, sqliteMigrations)
    expect(getSchemaVersion(db)).toBe(14)
  })
})

describe('getAppliedMigrations', () => {
  it('returns empty array when no migrations applied', () => {
    expect(getAppliedMigrations(db)).toHaveLength(0)
  })

  it('returns all applied migrations in order', () => {
    runMigrations(db, sqliteMigrations)
    const applied = getAppliedMigrations(db)

    expect(applied).toHaveLength(14)
    expect(applied[0]!.version).toBe(1)
    expect(applied[0]!.name).toBe('initial_schema')
    expect(applied[13]!.version).toBe(14)
    expect(applied[7]!.name).toBe('site_settings')
  })
})

describe('SQLite V001 initial schema', () => {
  it('creates content table with locale column', () => {
    runMigrations(db, [sqliteMigrations[0]!])

    // Insert a row with locale
    db.prepare(
      "INSERT INTO content (id, collection, slug, version, is_current, fields, body, html, sections, status, locale, source) VALUES ('pages/home:1', 'pages', 'home', 1, 1, '{}', 'body', '<p>body</p>', '{}', 'draft', 'en', 'fs')",
    ).run()

    const row = db.prepare('SELECT locale FROM content WHERE slug = ?').get('home') as {
      locale: string
    }
    expect(row.locale).toBe('en')
  })
})

/**
 * Several processes opening the same database file at once is normal operation —
 * a server, a CLI, or a framework spawning one build worker per core. Deciding
 * what is pending and applying it must therefore be atomic across processes, not
 * just within one. Child processes are the only faithful way to test it: the
 * better-sqlite3 API is synchronous, so a single process cannot interleave two
 * migration runs.
 */
describe('runMigrations across processes', () => {
  const PROCESS_COUNT = 8
  const TABLE_COUNT = 6
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'krantho-migrate-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  // Node strips types but does not resolve the source's .js specifiers back to
  // .ts, so the child imports the two modules it needs directly and declares its
  // own migrations. Any set of table-creating migrations exercises the race: every
  // process opens the same new file and races to run the same CREATE TABLEs.
  const CHILD_SCRIPT = `
    const { openDatabase } = await import(process.env['CONNECTION'])
    const { runMigrations } = await import(process.env['RUNNER'])
    const migrations = Array.from({ length: Number(process.env['TABLE_COUNT']) }, (_, i) => ({
      version: i + 1,
      name: 'create_t' + i,
      apply: (d) => d.exec('CREATE TABLE t' + i + ' (id INTEGER PRIMARY KEY)'),
    }))
    const wait = Number(process.env['START_AT']) - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    const db = openDatabase(process.env['DB_FILE'])
    runMigrations(db, migrations)
    db.close()
  `

  function migrateInChildProcess(dbFile: string, startAt: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--input-type=module', '-e', CHILD_SCRIPT], {
        env: {
          ...process.env,
          DB_FILE: dbFile,
          START_AT: String(startAt),
          TABLE_COUNT: String(TABLE_COUNT),
          CONNECTION: fileURLToPath(new URL('../src/connection.ts', import.meta.url)),
          RUNNER: fileURLToPath(new URL('../src/migration-runner.ts', import.meta.url)),
        },
        stdio: ['ignore', 'ignore', 'pipe'],
      })

      let stderr = ''
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
      })
      child.on('error', reject)
      child.on('close', (code) => resolve(code === 0 ? '' : stderr.trim() || `exit ${code}`))
    })
  }

  it('lets concurrent processes migrate the same fresh database', async () => {
    const dbFile = join(dir, 'content.db')
    const startAt = Date.now() + 1000

    const failures = (
      await Promise.all(
        Array.from({ length: PROCESS_COUNT }, () => migrateInChildProcess(dbFile, startAt)),
      )
    ).filter((f) => f !== '')

    expect(failures).toEqual([])

    const db = new Database(dbFile)
    expect(getSchemaVersion(db)).toBe(TABLE_COUNT)
    expect(getAppliedMigrations(db)).toHaveLength(TABLE_COUNT)
    db.close()
  }, 60000)
})
