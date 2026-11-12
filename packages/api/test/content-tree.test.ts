import { describe, expect, it } from 'vitest'
import { PUBLIC_MACHINE_READ_CACHE_CONTROL } from '../src/public-cache.js'
import { asUser, testApi, testStores } from './assistant/fixtures.js'

async function seeded() {
  const stores = testStores()
  await stores.adapter.seed(
    {
      collection: 'pages',
      slug: 'about',
      fields: { title: 'About' },
      body: '# About\n\nLong body',
    },
    'published',
  )
  await stores.adapter.seed(
    { collection: 'pages', slug: 'pricing', fields: { title: 'Pricing' }, body: '# Pricing' },
    'draft',
  )
  await stores.adapter.seed(
    { collection: 'pages', slug: 'om-oss', locale: 'nb', fields: { title: 'Om oss' }, body: 'x' },
    'published',
  )
  await stores.adapter.seed(
    { collection: 'notes', slug: 'first', fields: { title: 'First', category: 'a' }, body: 'n' },
    'published',
  )
  return stores
}

describe('GET /api/content-tree', () => {
  it('lists every collection in the order they are defined, each document as meta alone', async () => {
    const api = testApi(await seeded())
    const res = await api.handle(asUser(undefined, 'GET', '/api/content-tree'))
    expect(res.status).toBe(200)
    const { collections } = res.body as {
      collections: Array<{ name: string; documents: Array<Record<string, unknown>> }>
    }
    expect(collections.map((c) => c.name)).toEqual(['pages', 'articles', 'faq', 'notes'])
    const pages = collections[0]?.documents ?? []
    expect(pages.map((d) => `${d['slug']}:${d['status']}`).sort()).toEqual([
      'about:published',
      'om-oss:published',
      'pricing:draft',
    ])
    for (const document of collections.flatMap((c) => c.documents)) {
      expect(Object.keys(document)).toEqual(
        expect.arrayContaining([
          'collection',
          'slug',
          'locale',
          'version',
          'liveVersion',
          'status',
        ]),
      )
      for (const content of ['fields', 'body', 'html', 'sections']) {
        expect(document).not.toHaveProperty(content)
      }
    }
    expect(JSON.stringify(res.body)).not.toContain('Long body')
  })

  it('reads the metas of the locale asked for, in slug order, in one query', async () => {
    const stores = await seeded()
    const api = testApi(stores)
    const req = asUser(undefined, 'GET', '/api/content-tree')
    const res = await api.handle({ ...req, query: { locale: 'nb' } })
    const { collections } = res.body as {
      collections: Array<{ name: string; documents: Array<{ slug: string }> }>
    }
    expect(collections[0]?.documents.map((d) => d.slug)).toEqual(['om-oss'])
    expect(stores.adapter.queries).toEqual([
      {
        state: 'current',
        projection: 'meta',
        collections: ['pages', 'articles', 'faq', 'notes'],
        sort: 'slug',
        locale: 'nb',
      },
    ])
  })

  it('reads every locale in one query when none is asked for', async () => {
    const stores = await seeded()
    await testApi(stores).handle(asUser(undefined, 'GET', '/api/content-tree'))
    expect(stores.adapter.queries).toHaveLength(1)
    expect(stores.adapter.queries[0]?.locale).toBeUndefined()
  })

  it('answers 501 for an adapter that cannot query', async () => {
    const stores = await seeded()
    Object.defineProperty(stores.adapter, 'query', { value: undefined })
    const res = await testApi(stores).handle(asUser(undefined, 'GET', '/api/content-tree'))
    expect(res.status).toBe(501)
  })
})

describe('the sitemap, robots.txt and llms.txt', () => {
  it('may be kept by a CDN for an hour and served stale for a day while one request renews them', async () => {
    const api = testApi(await seeded())
    for (const path of ['/api/seo/sitemap', '/api/seo/robots.txt', '/api/seo/llms.txt']) {
      const res = await api.handle(asUser(undefined, 'GET', path))
      expect(res.status, path).toBe(200)
      expect(res.headers?.['cache-control'], path).toBe(PUBLIC_MACHINE_READ_CACHE_CONTROL)
    }
    expect(PUBLIC_MACHINE_READ_CACHE_CONTROL).toBe(
      'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    )
  })

  it('read no document content from the store', async () => {
    const stores = await seeded()
    const api = testApi(stores)
    for (const path of ['/api/seo/sitemap', '/api/seo/llms.txt']) {
      await api.handle(asUser(undefined, 'GET', path))
    }
    expect(stores.adapter.queries.every((query) => query.projection !== 'full')).toBe(true)
  })
})
