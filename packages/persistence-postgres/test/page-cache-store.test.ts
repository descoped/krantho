import type { PageCacheValue } from '@krantho/persistence'
import type { Sql } from 'postgres'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { runMigrations } from '../src/migration-runner.js'
import { postgresMigrations } from '../src/migrations/index.js'
import { PostgresPageCacheStore } from '../src/postgres-page-cache-store.js'

/**
 * Integration tests for the shared page cache store against the pooled
 * testcontainer (`postgres-container-setup.ts`). The store stamps times with the
 * database clock, so ordering is forced with short pauses and asserted relative
 * to the stamps the store returns.
 */
const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

describe('PostgresPageCacheStore (integration)', () => {
  let sql: Sql
  let store: PostgresPageCacheStore

  beforeAll(async () => {
    const connectionUri = process.env.KRANTHO_TEST_POSTGRES_URL
    if (!connectionUri) {
      throw new Error('KRANTHO_TEST_POSTGRES_URL not set — globalSetup did not run.')
    }
    sql = postgres(connectionUri, { max: 8, onnotice: () => {} })
    await runMigrations(sql, postgresMigrations)
    store = new PostgresPageCacheStore(sql)
  })

  afterAll(async () => {
    await sql?.end({ timeout: 5 })
  })

  beforeEach(async () => {
    await sql`TRUNCATE TABLE page_cache_entries, page_cache_tags`
  })

  /** Read a tag's stored marks */
  async function marks(tag: string): Promise<{ stale: number; expired: number | null }> {
    const rows = await sql<{ stale_at: string; expired_at: string | null }[]>`
      SELECT stale_at, expired_at FROM page_cache_tags WHERE tag = ${tag}`
    const row = rows[0]!
    return {
      stale: Number(row.stale_at),
      expired: row.expired_at === null ? null : Number(row.expired_at),
    }
  }

  describe('entries', () => {
    it('returns null for a key never set', async () => {
      expect(await store.get('/missing')).toBeNull()
    })

    it('round-trips a value with binary leaves, stamping lastModified', async () => {
      const before = Date.now()
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
      expect(typeof entry!.lastModified).toBe('number')
      expect(Math.abs(entry!.lastModified - before)).toBeLessThan(60_000)
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
      const first = (await store.get('/about'))!
      await pause(5)
      await store.set('/about', 'second', ['c'])

      const entry = (await store.get('/about'))!
      expect(entry.value).toBe('second')
      expect(entry.tags).toEqual(['c'])
      expect(entry.lastModified).toBeGreaterThan(first.lastModified)
      const [count] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM page_cache_entries`
      expect(count!.n).toBe(1)
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

  describe('tag marks', () => {
    it('reports fresh for no tags, unknown tags and tags never marked', async () => {
      expect(await store.tagsRevalidatedSince([], 0)).toBe('fresh')
      expect(await store.tagsRevalidatedSince(['never-marked'], 0)).toBe('fresh')
    })

    it('marks unknown tags (no entry carries them) without error', async () => {
      await store.markTags(['k:d:pages:ghost'], { expire: true })
      const { expired } = await marks('k:d:pages:ghost')
      expect(await store.tagsRevalidatedSince(['k:d:pages:ghost'], expired!)).toBe('expired')
    })

    it('a stale mark reads stale for entries written before it, fresh after', async () => {
      await store.set('/about', 'page', ['k:site'])
      const before = (await store.get('/about'))!
      await pause(5)
      await store.markTags(['k:site'], { expire: false })
      await pause(5)
      await store.set('/about', 'page again', ['k:site'])
      const after = (await store.get('/about'))!

      expect(await store.tagsRevalidatedSince(['k:site'], before.lastModified)).toBe('stale')
      expect(await store.tagsRevalidatedSince(['k:site'], after.lastModified)).toBe('fresh')
      expect((await marks('k:site')).expired).toBeNull()
    })

    it('an expire mark reads expired before it and fresh after it', async () => {
      await store.set('/about', 'page', ['k:d:pages:about'])
      const before = (await store.get('/about'))!
      await pause(5)
      await store.markTags(['k:d:pages:about'], { expire: true })
      await pause(5)
      await store.set('/about', 'page again', ['k:d:pages:about'])
      const after = (await store.get('/about'))!

      expect(await store.tagsRevalidatedSince(['k:d:pages:about'], before.lastModified)).toBe(
        'expired',
      )
      expect(await store.tagsRevalidatedSince(['k:d:pages:about'], after.lastModified)).toBe(
        'fresh',
      )
    })

    it('expired wins over stale across the tags of one entry', async () => {
      const since = (
        await sql<{ ms: string }[]>`
        SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS ms`
      )[0]!.ms
      await store.markTags(['k:site'], { expire: false })
      await store.markTags(['k:d:pages:about'], { expire: true })

      expect(await store.tagsRevalidatedSince(['k:site'], Number(since))).toBe('stale')
      expect(await store.tagsRevalidatedSince(['k:site', 'k:d:pages:about'], Number(since))).toBe(
        'expired',
      )
    })

    it('a later stale mark never downgrades an expiry, and marks are monotonic', async () => {
      await store.markTags(['k:site'], { expire: true })
      const expiredMark = await marks('k:site')
      await pause(5)
      await store.markTags(['k:site'], { expire: false })
      await store.markTags(['k:site', 'k:site'], { expire: false })
      const later = await marks('k:site')

      expect(later.expired).toBe(expiredMark.expired)
      expect(later.stale).toBeGreaterThan(expiredMark.stale)
      expect(await store.tagsRevalidatedSince(['k:site'], expiredMark.expired!)).toBe('expired')
      expect(await store.tagsRevalidatedSince(['k:site'], expiredMark.expired! + 1)).toBe('stale')
      const [count] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM page_cache_tags`
      expect(count!.n).toBe(1)
    })

    it('handles many tags per entry and per mark', async () => {
      const tags = Array.from({ length: 1_000 }, (_, i) => `k:d:pages:p${i}`)
      await store.set('/list', 'page', tags)
      const entry = (await store.get('/list'))!
      expect(entry.tags).toHaveLength(1_000)

      await pause(5)
      await store.markTags(tags.slice(500), { expire: false })
      await store.markTags([tags[999]!], { expire: true })
      expect(await store.tagsRevalidatedSince(tags.slice(0, 500), entry.lastModified)).toBe('fresh')
      expect(await store.tagsRevalidatedSince(tags.slice(0, 501), entry.lastModified)).toBe('stale')
      expect(await store.tagsRevalidatedSince(tags, entry.lastModified)).toBe('expired')
    })

    it('concurrent marks over overlapping tags in opposite orders all land', async () => {
      const tags = Array.from({ length: 50 }, (_, i) => `k:c:c${i}`)
      await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          store.markTags(i % 2 === 0 ? tags : [...tags].reverse(), { expire: i % 3 === 0 }),
        ),
      )
      const [count] = await sql<{ n: number }[]>`
        SELECT COUNT(*)::int AS n FROM page_cache_tags WHERE expired_at IS NOT NULL`
      expect(count!.n).toBe(50)
    })
  })

  describe('countTagged', () => {
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
})
