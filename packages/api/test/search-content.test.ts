import { describe, expect, it } from 'vitest'
import { asUser, testApi, testStores } from './assistant/fixtures.js'

interface Hit {
  meta: { collection: string; slug: string; locale: string }
  fields: Record<string, unknown>
  snippet?: string
}

interface Page {
  items: Hit[]
  hasMore: boolean
  total?: number
}

function search(query: Record<string, string>) {
  return { ...asUser(undefined, 'GET', '/api/content/search'), query }
}

const idOf = (hit: Hit): string => `${hit.meta.collection}/${hit.meta.slug}`

/**
 * Two non-matching pages ahead of a matching one, a matching article, and a page that
 * matches only by its slug, a body and a field each
 */
async function seeded() {
  const stores = testStores()
  const draft = (collection: string, slug: string, title: string, body = '') =>
    stores.adapter.seed({ collection, slug, fields: { title }, body }, 'draft')
  await draft('pages', 'a-one', 'First')
  await draft('pages', 'a-two', 'Second')
  await draft('pages', 'a-three', 'Third', 'The needle sits in this body.')
  await draft('articles', 'b-one', 'The Needle article')
  await draft('pages', 'needle-slug', 'Only the slug matches')
  return { stores }
}

describe('GET /api/content/search', () => {
  it('answers items of meta, fields and snippet with hasMore, in one query', async () => {
    const { stores } = await seeded()
    const res = await testApi(stores).handle(search({ q: 'NEEDLE' }))
    expect(res.status).toBe(200)
    const page = res.body as Page
    expect(page.hasMore).toBe(false)
    expect(page.total).toBeUndefined()
    expect(page.items.map(idOf).sort()).toEqual([
      'articles/b-one',
      'pages/a-three',
      'pages/needle-slug',
    ])
    expect(stores.adapter.queries).toHaveLength(1)
    expect(stores.adapter.queries[0]).toMatchObject({
      state: 'current',
      projection: 'summary',
      match: { text: 'NEEDLE', in: ['slug', 'fields', 'body'] },
    })
  })

  it('carries the snippet around the match and no body, html or sections', async () => {
    const { stores } = await seeded()
    const res = await testApi(stores).handle(search({ q: 'needle' }))
    const page = res.body as Page
    for (const hit of page.items) {
      expect(Object.keys(hit).filter((key) => key !== 'snippet')).toEqual(['meta', 'fields'])
    }
    const byId = new Map(page.items.map((hit) => [idOf(hit), hit]))
    expect(byId.get('pages/a-three')?.snippet).toBe('The needle sits in this body.')
    expect(byId.get('articles/b-one')?.snippet).toContain('Needle article')
    expect(byId.get('pages/needle-slug')?.snippet).toBeUndefined()
  })

  it('cuts the snippet 80 characters before the match, 200 long, whitespace collapsed', async () => {
    const stores = testStores()
    const body = `${'x\n'.repeat(60)}needle${' y'.repeat(200)}`
    await stores.adapter.seed(
      { collection: 'pages', slug: 'long', fields: { title: 'Long' }, body },
      'draft',
    )
    const res = await testApi(stores).handle(search({ q: 'needle' }))
    const [hit] = (res.body as Page).items
    const window = body.slice(120 - 80, 120 - 80 + 200)
    expect(hit?.snippet).toBe(window.replace(/\s+/g, ' '))
    expect(hit?.snippet).toContain('needle')
  })

  it('takes the snippet from the fields when the body does not match', async () => {
    const stores = testStores()
    await stores.adapter.seed(
      { collection: 'pages', slug: 'f', fields: { title: 'Find the NEEDLE' }, body: 'nothing' },
      'draft',
    )
    const res = await testApi(stores).handle(search({ q: 'needle' }))
    expect((res.body as Page).items[0]?.snippet).toBe('{"title":"Find the NEEDLE"}')
  })

  it('finds a match in a later collection beyond the first page of an earlier one', async () => {
    const { stores } = await seeded()
    // One page across every collection, not a page per collection: the limit counts matches in
    // collection, slug order, and pages/a-three sits behind a page that does not match
    const res = await testApi(stores).handle(search({ q: 'needle', limit: '2' }))
    const page = res.body as Page
    expect(page.items.map(idOf)).toEqual(['articles/b-one', 'pages/a-three'])
    expect(page.hasMore).toBe(true)
    expect(stores.adapter.queries).toHaveLength(1)
  })

  it('pages with limit and offset until hasMore is false', async () => {
    const { stores } = await seeded()
    const api = testApi(stores)
    const seen: string[] = []
    const flags: boolean[] = []
    for (const offset of [0, 1, 2]) {
      const res = await api.handle(search({ q: 'needle', limit: '1', offset: String(offset) }))
      expect(res.status).toBe(200)
      const page = res.body as Page
      expect(page.items).toHaveLength(1)
      seen.push(...page.items.map(idOf))
      flags.push(page.hasMore)
    }
    expect(flags).toEqual([true, true, false])
    expect([...seen].sort()).toEqual(['articles/b-one', 'pages/a-three', 'pages/needle-slug'])
    expect(new Set(seen).size).toBe(3)
    expect(stores.adapter.queries).toHaveLength(3)
  })

  it('caps the limit at the configured maximum', async () => {
    const { stores } = await seeded()
    await testApi(stores).handle(search({ q: 'needle', limit: '1000000' }))
    expect(stores.adapter.queries[0]?.limit).toBe(500)
  })

  it('filters by locale', async () => {
    const { stores } = await seeded()
    await stores.adapter.seed(
      { collection: 'pages', slug: 'nb-needle', locale: 'nb', fields: { title: 'Nål' } },
      'draft',
    )
    const res = await testApi(stores).handle(search({ q: 'needle', locale: 'nb' }))
    expect((res.body as Page).items.map(idOf)).toEqual(['pages/nb-needle'])
  })

  it('answers an empty page when nothing matches', async () => {
    const { stores } = await seeded()
    const res = await testApi(stores).handle(search({ q: 'matches nothing' }))
    expect(res.body).toEqual({ items: [], hasMore: false })
  })

  it('refuses a query shorter than the minimum with 400', async () => {
    const { stores } = await seeded()
    const api = testApi(stores)
    for (const q of ['', ' n ', 'n']) {
      expect((await api.handle(search({ q }))).status).toBe(400)
    }
    expect(stores.adapter.queries).toHaveLength(0)
  })

  it('answers 501 when the adapter cannot query', async () => {
    const { stores } = await seeded()
    const withoutQuery = Object.create(stores.adapter, {
      query: { value: undefined },
    }) as typeof stores.adapter
    const res = await testApi({ ...stores, adapter: withoutQuery }).handle(search({ q: 'needle' }))
    expect(res.status).toBe(501)
  })
})
