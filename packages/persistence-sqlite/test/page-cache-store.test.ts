import type { PageCacheValue } from '@krantho/persistence'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runMigrations } from '../src/migration-runner.js'
import { sqliteMigrations } from '../src/migrations/index.js'
import { SqlitePageCacheStore } from '../src/page-cache-store.js'

let db: Database.Database
let store: SqlitePageCacheStore

/** The store stamps times with Date.now(); only Date is faked, so async still runs */
function at(ms: number): void {
  vi.setSystemTime(ms)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  at(1_000)
  db = new Database(':memory:')
  runMigrations(db, sqliteMigrations)
  store = new SqlitePageCacheStore(db)
})

afterEach(() => {
  vi.useRealTimers()
  db.close()
})

describe('SqlitePageCacheStore entries', () => {
  it('returns null for a key never set', async () => {
    expect(await store.get('/missing')).toBeNull()
  })

  it('round-trips a value with binary leaves, stamping lastModified', async () => {
    const value: PageCacheValue = {
      kind: 'APP_PAGE',
      html: '<h1>About</h1>',
      status: 200,
      postponed: undefined,
      rscData: Buffer.from([0, 1, 2, 250, 255]),
      segments: [['/_tree', new Uint8Array([9, 8, 7])]],
      headers: { 'x-next-cache-tags': 'k:site,k:d:pages:about' },
      nothing: null,
    }
    await store.set('/about', value, ['k:site', 'k:d:pages:about', 'k:site'])

    const entry = await store.get('/about')
    expect(entry).not.toBeNull()
    expect(entry!.lastModified).toBe(1_000)
    expect(entry!.tags).toEqual(['k:site', 'k:d:pages:about'])
    const read = entry!.value as Record<string, PageCacheValue>
    expect(read.html).toBe('<h1>About</h1>')
    expect(read.status).toBe(200)
    expect(read.nothing).toBeNull()
    expect('postponed' in read).toBe(false)
    expect(read.rscData).toBeInstanceOf(Uint8Array)
    expect(Array.from(read.rscData as Uint8Array)).toEqual([0, 1, 2, 250, 255])
    const segment = (read.segments as PageCacheValue[][])[0]!
    expect(segment[0]).toBe('/_tree')
    expect(Array.from(segment[1] as Uint8Array)).toEqual([9, 8, 7])
    expect(read.headers).toEqual({ 'x-next-cache-tags': 'k:site,k:d:pages:about' })
  })

  it('round-trips a large binary value', async () => {
    const bytes = new Uint8Array(200_000).map((_, i) => i % 256)
    await store.set('big', { body: bytes }, [])
    const read = (await store.get('big'))!.value as { body: Uint8Array }
    expect(read.body).toEqual(bytes)
  })

  it('overwrites an entry: value, tags and lastModified are replaced, not appended', async () => {
    await store.set('/about', 'first', ['a', 'b'])
    at(2_000)
    await store.set('/about', 'second', ['c'])

    const entry = await store.get('/about')
    expect(entry).toEqual({ value: 'second', tags: ['c'], lastModified: 2_000 })
    const count = db.prepare('SELECT COUNT(*) AS n FROM page_cache_entries').get() as { n: number }
    expect(count.n).toBe(1)
  })

  it('keeps one consistent entry under concurrent sets of one key', async () => {
    await Promise.all(
      Array.from({ length: 25 }, (_, i) => store.set('/hot', { writer: i }, [`t${i}`])),
    )
    const entry = await store.get('/hot')
    const writer = (entry!.value as { writer: number }).writer
    expect(entry!.tags).toEqual([`t${writer}`])
  })
})

describe('SqlitePageCacheStore tag marks', () => {
  it('reports fresh for no tags, unknown tags and tags never marked', async () => {
    expect(await store.tagsRevalidatedSince([], 0)).toBe('fresh')
    expect(await store.tagsRevalidatedSince(['never-marked'], 0)).toBe('fresh')
  })

  it('marks unknown tags (no entry carries them) without error', async () => {
    await store.markTags(['k:d:pages:ghost'], { expire: true })
    expect(await store.tagsRevalidatedSince(['k:d:pages:ghost'], 1_000)).toBe('expired')
  })

  it('a stale mark reads stale for entries written at or before it, fresh after', async () => {
    await store.set('/about', 'page', ['k:site'])
    at(1_500)
    await store.markTags(['k:site'], { expire: false })

    expect(await store.tagsRevalidatedSince(['k:site'], 1_000)).toBe('stale')
    expect(await store.tagsRevalidatedSince(['k:site'], 1_500)).toBe('stale')
    expect(await store.tagsRevalidatedSince(['k:site'], 1_501)).toBe('fresh')
  })

  it('an expire mark reads expired before it and fresh after it', async () => {
    at(3_000)
    await store.markTags(['k:d:pages:about'], { expire: true })

    expect(await store.tagsRevalidatedSince(['k:d:pages:about'], 2_999)).toBe('expired')
    expect(await store.tagsRevalidatedSince(['k:d:pages:about'], 3_001)).toBe('fresh')
  })

  it('expired wins over stale across the tags of one entry', async () => {
    at(2_000)
    await store.markTags(['k:site'], { expire: false })
    await store.markTags(['k:d:pages:about'], { expire: true })

    expect(await store.tagsRevalidatedSince(['k:site'], 1_000)).toBe('stale')
    expect(await store.tagsRevalidatedSince(['k:site', 'k:d:pages:about'], 1_000)).toBe('expired')
  })

  it('a later stale mark never downgrades an expiry', async () => {
    at(2_000)
    await store.markTags(['k:site'], { expire: true })
    at(3_000)
    await store.markTags(['k:site'], { expire: false })

    expect(await store.tagsRevalidatedSince(['k:site'], 1_500)).toBe('expired')
    expect(await store.tagsRevalidatedSince(['k:site'], 2_500)).toBe('stale')
  })

  it('never moves a timestamp backwards and is idempotent', async () => {
    at(5_000)
    await store.markTags(['k:site'], { expire: true })
    at(4_000)
    await store.markTags(['k:site'], { expire: true })
    await store.markTags(['k:site', 'k:site'], { expire: false })

    const row = db
      .prepare('SELECT stale_at, expired_at FROM page_cache_tags WHERE tag = ?')
      .get('k:site')
    expect(row).toEqual({ stale_at: 5_000, expired_at: 5_000 })
    const count = db.prepare('SELECT COUNT(*) AS n FROM page_cache_tags').get() as { n: number }
    expect(count.n).toBe(1)
  })

  it('handles many tags per entry and per mark', async () => {
    const tags = Array.from({ length: 1_000 }, (_, i) => `k:d:pages:p${i}`)
    await store.set('/list', 'page', tags)
    expect((await store.get('/list'))!.tags).toHaveLength(1_000)

    at(2_000)
    await store.markTags(tags.slice(500), { expire: false })
    await store.markTags([tags[999]!], { expire: true })
    expect(await store.tagsRevalidatedSince(tags.slice(0, 500), 1_000)).toBe('fresh')
    expect(await store.tagsRevalidatedSince(tags.slice(0, 501), 1_000)).toBe('stale')
    expect(await store.tagsRevalidatedSince(tags, 1_000)).toBe('expired')
  })
})

describe('SqlitePageCacheStore countTagged', () => {
  const page: PageCacheValue = { kind: 'APP_PAGE', html: '<p/>', status: 200 }

  it('counts the entries that carry any of the tags, each entry once', async () => {
    await store.set('/about', page, ['k:site', 'k:d:pages:about'])
    await store.set('/', page, ['k:site', 'k:c:pages'])
    await store.set('/blog/a', page, ['k:d:blog:a'])

    expect(await store.countTagged(['k:d:pages:about', 'k:site'])).toBe(2)
    expect(await store.countTagged(['k:c:pages'])).toBe(1)
    expect(await store.countTagged(['k:unknown'])).toBe(0)
    expect(await store.countTagged([])).toBe(0)
  })
})
