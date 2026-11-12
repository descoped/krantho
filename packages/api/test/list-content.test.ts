import { describe, expect, it } from 'vitest'
import { asUser, testApi, testStores } from './assistant/fixtures.js'

function request(path: string, query: Record<string, string>, collection?: string) {
  return {
    ...asUser(undefined, 'GET', path),
    params: collection ? { collection } : {},
    query,
  }
}

interface Page {
  items: Array<{ meta?: { collection: string; slug: string } }>
  hasMore: boolean
  total?: number
}

/** Three pages, two articles and an FAQ entry, */
async function seeded() {
  const stores = testStores()
  for (const slug of ['a', 'b', 'c']) {
    await stores.adapter.seed({ collection: 'pages', slug, fields: { title: slug } }, 'published')
  }
  for (const slug of ['x', 'y']) {
    await stores.adapter.seed({ collection: 'articles', slug, fields: { title: slug } }, 'draft')
  }
  await stores.adapter.seed(
    { collection: 'faq', slug: 'q', fields: { question: 'q', answer: 'a' } },
    'draft',
  )
  return { stores }
}

const slugs = (page: Page): string[] => page.items.map((item) => item.meta?.slug ?? '')

describe('GET /api/content/:collection', () => {
  it('pages across three pages with hasMore, one query per request and no count', async () => {
    const { stores } = await seeded()
    const api = testApi(stores)
    const seen: string[] = []
    const flags: boolean[] = []
    for (const offset of [0, 1, 2]) {
      const res = await api.handle(
        request(
          '/api/content/pages',
          { sort: 'slug', limit: '1', offset: String(offset) },
          'pages',
        ),
      )
      expect(res.status).toBe(200)
      const page = res.body as Page
      seen.push(...slugs(page))
      flags.push(page.hasMore)
      expect(page.total).toBeUndefined()
    }
    expect(seen).toEqual(['a', 'b', 'c'])
    expect(flags).toEqual([true, true, false])
    expect(stores.adapter.queries).toHaveLength(3)
    expect(stores.adapter.queries.every((q) => q.collections?.join() === 'pages')).toBe(true)
  })

  it('reads the projection the view names', async () => {
    const { stores } = await seeded()
    const api = testApi(stores)
    for (const [view, projection] of [
      ['meta', 'meta'],
      ['summary', 'summary'],
      [undefined, 'full'],
    ] as const) {
      stores.adapter.queries.length = 0
      await api.handle(request('/api/content/pages', view ? { view } : {}, 'pages'))
      expect(stores.adapter.queries.map((q) => q.projection)).toEqual([projection])
    }
  })
})

describe('GET /api/content', () => {
  it('lists every configured collection when none is named', async () => {
    const { stores } = await seeded()
    const res = await testApi(stores).handle(request('/api/content', { view: 'meta' }))
    expect(res.status).toBe(200)
    const page = res.body as { items: Array<{ collection: string }>; hasMore: boolean }
    expect(page.hasMore).toBe(false)
    expect(page.items.map((meta) => meta.collection).sort()).toEqual([
      'articles',
      'articles',
      'faq',
      'pages',
      'pages',
      'pages',
    ])
    expect(stores.adapter.queries).toHaveLength(1)
  })

  it('reads an empty or comma-only collections= as naming none, so every collection', async () => {
    const { stores } = await seeded()
    const api = testApi(stores)
    for (const collections of ['', ',', ' , ']) {
      const res = await api.handle(request('/api/content', { view: 'meta', collections }))
      expect(res.status).toBe(200)
      expect((res.body as { items: unknown[] }).items).toHaveLength(6)
    }
  })

  it('filters by collections= and pages across them', async () => {
    const { stores } = await seeded()
    const api = testApi(stores)
    const seen: string[] = []
    const flags: boolean[] = []
    for (const offset of [0, 2, 4]) {
      const res = await api.handle(
        request('/api/content', {
          collections: 'pages,articles',
          view: 'summary',
          limit: '2',
          offset: String(offset),
        }),
      )
      expect(res.status).toBe(200)
      const page = res.body as Page
      seen.push(...page.items.map((item) => `${item.meta?.collection}/${item.meta?.slug}`))
      flags.push(page.hasMore)
    }
    expect(seen).toEqual(['articles/x', 'articles/y', 'pages/a', 'pages/b', 'pages/c'])
    expect(flags).toEqual([true, true, false])
    expect(stores.adapter.queries).toHaveLength(3)
  })

  it('refuses an unknown collection with 400', async () => {
    const { stores } = await seeded()
    const res = await testApi(stores).handle(request('/api/content', { collections: 'pages,nope' }))
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Unknown collection: nope' })
    expect(stores.adapter.queries).toHaveLength(0)
  })

  it('refuses an unknown view with 400 and answers 501 without query', async () => {
    const { stores } = await seeded()
    const api = testApi(stores)
    expect((await api.handle(request('/api/content', { view: 'wide' }))).status).toBe(400)

    const withoutQuery = Object.create(stores.adapter, {
      query: { value: undefined },
    }) as typeof stores.adapter
    const bare = testApi({ ...stores, adapter: withoutQuery })
    expect((await bare.handle(request('/api/content', {}))).status).toBe(501)
  })

  it('is listed in the OpenAPI spec', async () => {
    const { stores } = await seeded()
    const res = await testApi(stores).handle(request('/api/openapi.json', {}))
    const paths = (res.body as { paths: Record<string, unknown> }).paths
    expect(paths['/api/content']).toBeDefined()
  })
})
