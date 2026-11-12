import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_SQLITE_CONNECTION_OPTIONS,
  DEFAULT_SQLITE_STATUS,
  openDatabase,
  SQLiteAdapter,
} from '../src/index.js'

const dirs: string[] = []

function tempDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'krantho-connection-'))
  dirs.push(dir)
  return join(dir, 'content.db')
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('openDatabase tuning', () => {
  it('applies the shipped busy timeout when no options are given', () => {
    const db = openDatabase(tempDbPath())
    expect(db.pragma('busy_timeout', { simple: true })).toBe(
      DEFAULT_SQLITE_CONNECTION_OPTIONS.busyTimeoutMs,
    )
    db.close()
  })

  it('applies a caller-supplied busy timeout', () => {
    const db = openDatabase(tempDbPath(), { busyTimeoutMs: 1234 })
    expect(db.pragma('busy_timeout', { simple: true })).toBe(1234)
    db.close()
  })

  it('still puts the connection into WAL mode with foreign keys on', () => {
    const db = openDatabase(tempDbPath(), { busyTimeoutMs: 1, walRetries: 3, walRetryDelayMs: 1 })
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal')
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    db.close()
  })
})

describe('SQLiteAdapter options', () => {
  it('passes connection tuning through to the pragmas', () => {
    const adapter = new SQLiteAdapter(tempDbPath(), { defaultLocale: 'en', busyTimeoutMs: 4321 })
    expect(adapter.database.pragma('busy_timeout', { simple: true })).toBe(4321)
    adapter.database.close()
  })

  it('saves a new document through the API as a draft', async () => {
    const adapter = new SQLiteAdapter(tempDbPath(), { defaultLocale: 'en' })
    await adapter.writeContent({ collection: 'pages', slug: 'home', fields: {}, body: '' })
    const doc = await adapter.getContent('pages', 'home')
    expect(doc?.meta.status).toBe('draft')
    expect(doc?.meta.liveVersion).toBeNull()
    adapter.database.close()
  })

  it('writes the configured status when frontmatter declares none', async () => {
    const adapter = new SQLiteAdapter(tempDbPath(), {
      defaultLocale: 'en',
      defaultStatus: { filesystem: 'draft' },
    })
    await adapter.upsertFromFile('pages', 'about', {}, '', '', {}, 'content/pages/about.md')
    const doc = await adapter.getContent('pages', 'about')
    expect(doc?.meta.status).toBe('draft')
    adapter.database.close()
  })

  it('keeps the shipped status default when a file declares none', async () => {
    const adapter = new SQLiteAdapter(tempDbPath(), { defaultLocale: 'en' })
    await adapter.upsertFromFile('pages', 'about', {}, '', '', {}, 'content/pages/about.md')
    expect((await adapter.getContent('pages', 'about'))?.meta.status).toBe(
      DEFAULT_SQLITE_STATUS.filesystem,
    )
    adapter.database.close()
  })
})
