import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { KranthoConfigInput } from '@krantho/config'
import { envNameFor, LEAVES } from '@krantho/config'
import { defineCollection } from '@krantho/schema'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

/**
 * With `cache.pages: 'next-isr'`, page reads go through the Next.js data cache
 * tagged with what they read, and API writes invalidate those tags. Next's
 * cache functions are stood in for: the data cache round-trips values through
 * JSON as the real one does, and `after()` callbacks are collected.
 */

interface CachedRead {
  keyParts: readonly string[]
  tags: readonly string[]
}

const cachedReads: CachedRead[] = []
const afterCallbacks: (() => Promise<unknown> | unknown)[] = []

vi.mock('next/cache.js', () => ({
  unstable_cache:
    <T>(read: () => Promise<T>, keyParts: string[], options: { tags: string[] }) =>
    async (): Promise<T> => {
      cachedReads.push({ keyParts, tags: options.tags })
      return JSON.parse(JSON.stringify(await read())) as T
    },
  revalidateTag: vi.fn(),
}))

vi.mock('next/server.js', () => ({
  after: (callback: () => Promise<unknown> | unknown) => {
    afterCallbacks.push(callback)
  },
}))

const { revalidateTag } = await import('next/cache')
const { createApiRouteHandlers, createContentLoader } = await import('../src/index.js')

const collections = {
  pages: defineCollection({
    name: 'pages',
    source: 'filesystem',
    directory: fileURLToPath(new URL('./fixtures/content/pages', import.meta.url)),
    schema: z.object({ title: z.string(), description: z.string() }),
  }),
}

const site = {
  domain: 'localhost',
  name: 'Cached',
  language: 'en',
  baseUrl: 'http://localhost:4002',
}

let dataDir: string
const savedEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const leaf of LEAVES) {
    const name = envNameFor(leaf)
    if (!name) continue
    for (const key of [name, `${name}_FILE`]) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
  }
  dataDir = join(mkdtempSync(join(tmpdir(), 'krantho-isr-')), 'data')
  cachedReads.length = 0
  afterCallbacks.length = 0
  vi.mocked(revalidateTag).mockClear()
})

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  rmSync(join(dataDir, '..'), { recursive: true, force: true })
  vi.unstubAllGlobals()
})

function isrConfig(): KranthoConfigInput {
  return { site, paths: { dataDir }, cache: { pages: 'next-isr' } }
}

describe('createContentLoader with next-isr', () => {
  it('caches each read under the tags of what it read', async () => {
    const loader = createContentLoader({ config: isrConfig(), collections })

    const home = await loader.getPublished({ collection: 'pages', slug: 'home' })
    await loader.listPublished('pages')
    await loader.jsonLd({ collection: 'pages', slug: 'about' })

    expect(home?.fields['title']).toBe('Home')
    expect(home?.publishedAt).toBeInstanceOf(Date)
    expect(cachedReads.map((read) => read.tags)).toEqual([
      ['k:site', 'k:d:pages:home'],
      ['k:site', 'k:c:pages'],
      [
        'k:site',
        'k:d:pages:about',
        'k:seo',
        'k:seo:site',
        'k:seo:collection%3apages',
        'k:seo:route',
      ],
    ])
  })

  it('caches the summaries of a collection under its list tags, without their bodies', async () => {
    const loader = createContentLoader({ config: isrConfig(), collections })

    const summaries = await loader.listPublishedSummaries('pages')
    await loader.listPublishedSummaries('pages', 'en')

    expect(summaries.map((doc) => doc.slug).sort()).toEqual(['about', 'home'])
    expect(summaries[0]?.publishedAt).toBeInstanceOf(Date)
    for (const doc of summaries) expect(doc).not.toHaveProperty('body')
    expect(cachedReads).toEqual([
      { keyParts: ['krantho', 'summaries', 'pages', ''], tags: ['k:site', 'k:c:pages'] },
      { keyParts: ['krantho', 'summaries', 'pages', 'en'], tags: ['k:site', 'k:c:pages'] },
    ])
  })

  it("passes the page's structure to the graph and keys the cache by it", async () => {
    const loader = createContentLoader({ config: isrConfig(), collections })
    const ref = { collection: 'pages', slug: 'about' }
    const structure = { trail: [{ name: 'Company', url: '/company' }, { name: 'About' }] }

    const graph = (await loader.jsonLd(ref, structure)) as {
      '@graph': Array<Record<string, unknown>>
    }
    await loader.jsonLd(ref)

    const list = graph['@graph'].find((node) => node['@type'] === 'BreadcrumbList')
    expect(list?.['itemListElement']).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Company', item: 'http://localhost:4002/company' },
      { '@type': 'ListItem', position: 2, name: 'About', item: 'http://localhost:4002/about' },
    ])
    const [withStructure, without] = cachedReads.map((read) => read.keyParts)
    expect(withStructure).toEqual([
      'krantho',
      'jsonld',
      'pages',
      'about',
      '',
      JSON.stringify(structure),
    ])
    expect(without).toEqual(['krantho', 'jsonld', 'pages', 'about', ''])
  })

  it('reads through without the Next.js cache when pages are not cached', async () => {
    const loader = createContentLoader({ config: { site, paths: { dataDir } }, collections })

    const home = await loader.getPublished({ collection: 'pages', slug: 'home' })

    expect(home?.fields['title']).toBe('Home')
    expect(cachedReads).toEqual([])
  })
})

describe('createApiRouteHandlers with next-isr', () => {
  const context = (...path: string[]) => ({ params: Promise.resolve({ path }) })
  const send = (method: string, path: string, body: unknown) =>
    new Request(`http://localhost:4002/api/${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('expires a published page, refreshes its collection, and renders it again after the request', async () => {
    const fetched: string[] = []
    vi.stubGlobal('fetch', async (url: URL) => {
      fetched.push(url.toString())
      return new Response('rendered')
    })
    const { POST } = createApiRouteHandlers({ config: isrConfig(), collections })

    const response = await POST(
      send('POST', 'content/pages/about/publish', { status: 'published' }),
      context('content', 'pages', 'about', 'publish'),
    )

    expect(response.status).toBe(200)
    expect(revalidateTag).toHaveBeenCalledWith('k:d:pages:about', { expire: 0 })
    expect(revalidateTag).toHaveBeenCalledWith('k:c:pages', 'max')
    for (const callback of afterCallbacks) await callback()
    expect(fetched).toEqual(['http://localhost:4002/about'])
  })

  it('renders a published document again at the path its collection declares, and nothing for one without pages', async () => {
    const fetched: string[] = []
    vi.stubGlobal('fetch', async (url: URL) => {
      fetched.push(url.toString())
      return new Response('rendered')
    })
    const directory = fileURLToPath(new URL('./fixtures/content/pages', import.meta.url))
    const schema = z.object({ title: z.string(), description: z.string() })
    const { POST } = createApiRouteHandlers({
      config: isrConfig(),
      collections: {
        guides: defineCollection({
          name: 'guides',
          source: 'filesystem',
          directory,
          schema,
          path: '/learn/:slug',
        }),
        snippets: defineCollection({
          name: 'snippets',
          source: 'filesystem',
          directory,
          schema,
          path: false,
        }),
      },
    })

    for (const collection of ['guides', 'snippets']) {
      const response = await POST(
        send('POST', `content/${collection}/about/publish`, { status: 'published' }),
        context('content', collection, 'about', 'publish'),
      )
      expect(response.status).toBe(200)
    }

    expect(revalidateTag).toHaveBeenCalledWith('k:d:snippets:about', { expire: 0 })
    for (const callback of afterCallbacks) await callback()
    expect(fetched).toEqual(['http://localhost:4002/learn/about'])
  })

  it('leaves cached pages alone for a draft save', async () => {
    const { PUT } = createApiRouteHandlers({ config: isrConfig(), collections })

    const response = await PUT(
      send('PUT', 'content/pages/about', {
        fields: { title: 'About', description: 'A draft' },
        body: 'Draft',
      }),
      context('content', 'pages', 'about'),
    )

    expect(response.status).toBe(200)
    const tags = vi.mocked(revalidateTag).mock.calls.map(([tag]) => tag)
    expect(tags).not.toContain('k:d:pages:about')
    expect(afterCallbacks).toEqual([])
  })

  it('invalidates nothing when pages are not cached', async () => {
    const { POST } = createApiRouteHandlers({ config: { site, paths: { dataDir } }, collections })

    await POST(
      send('POST', 'content/pages/about/publish', { status: 'published' }),
      context('content', 'pages', 'about', 'publish'),
    )

    expect(revalidateTag).not.toHaveBeenCalled()
    expect(afterCallbacks).toEqual([])
  })
})
