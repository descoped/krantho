import { describe, expect, it } from 'vitest'
import { asUser, testApi, testStores } from './assistant/fixtures.js'

function list(query: Record<string, string>) {
  return {
    ...asUser(undefined, 'GET', '/api/content/pages'),
    params: { collection: 'pages' },
    query,
  }
}

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
  return stores
}

describe('GET /api/content/:collection?view=summary', () => {
  it('lists each document as meta, fields and metadata, with no body, HTML or sections', async () => {
    const api = testApi(await seeded())
    const res = await api.handle(list({ view: 'summary', sort: 'slug' }))

    expect(res.status).toBe(200)
    const { items, hasMore } = res.body as {
      items: Array<Record<string, unknown>>
      hasMore: boolean
    }
    expect(hasMore).toBe(false)
    expect(items.map((item) => (item.fields as { title: string }).title)).toEqual([
      'About',
      'Pricing',
    ])
    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual(['fields', 'meta', 'metadata'])
    }
  })

  it('filters and pages the way the full list does', async () => {
    const api = testApi(await seeded())
    const full = await api.handle(list({ status: 'draft', limit: '1' }))
    const summary = await api.handle(list({ status: 'draft', limit: '1', view: 'summary' }))

    const slugs = (body: unknown) =>
      (body as { items: Array<{ meta: { slug: string } }> }).items.map((item) => item.meta.slug)
    expect(slugs(summary.body)).toEqual(slugs(full.body))
    expect((summary.body as { hasMore: boolean }).hasMore).toBe(
      (full.body as { hasMore: boolean }).hasMore,
    )
  })

  it('lists the meta alone for view=meta', async () => {
    const api = testApi(await seeded())
    const res = await api.handle(list({ view: 'meta', sort: 'slug' }))

    expect(res.status).toBe(200)
    const { items } = res.body as { items: Array<Record<string, unknown>> }
    expect(items.map((item) => item.slug)).toEqual(['about', 'pricing'])
    for (const item of items) {
      expect(Object.keys(item)).not.toContain('fields')
      expect(Object.keys(item)).not.toContain('body')
    }
  })

  it('refuses a view it does not know, naming both, instead of reading whole documents', async () => {
    const api = testApi(await seeded())
    const res = await api.handle(list({ view: 'sumary' }))
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: "view must be 'summary' or 'meta' when given" })
  })

  it('answers 501 when the adapter cannot query', async () => {
    const stores = await seeded()
    const withoutQuery = Object.create(stores.adapter, {
      query: { value: undefined },
    }) as typeof stores.adapter
    const api = testApi({ ...stores, adapter: withoutQuery })
    const res = await api.handle(list({ view: 'summary' }))
    expect(res.status).toBe(501)
  })

  it('still returns whole documents without the view', async () => {
    const api = testApi(await seeded())
    const res = await api.handle(list({}))
    const { items } = res.body as { items: Array<Record<string, unknown>> }
    expect(Object.keys(items[0] ?? {})).toContain('body')
  })
})
