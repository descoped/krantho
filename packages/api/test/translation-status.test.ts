import { describe, expect, it } from 'vitest'
import { translationStatus } from '../src/handlers/translation-status.js'
import type { ApiRequest } from '../src/types.js'
import { editor } from './assistant/auth.js'
import { testConfig, testContext, testStores } from './assistant/fixtures.js'

const nordic = testConfig({
  site: { language: 'nb', supportedLocales: ['nb', 'en', 'sv'], defaultLocale: 'nb' },
})

const request: ApiRequest = {
  method: 'GET',
  path: '/api/translations/status',
  params: {},
  query: {},
  headers: {},
}

async function seeded() {
  const stores = testStores('nb')
  const seed = (
    collection: string,
    slug: string,
    locale: string,
    status: 'published' | 'draft' = 'published',
  ) => stores.adapter.seed({ collection, slug, locale, fields: { title: slug } }, status)
  // Written out of slug and locale order, so the response's order is the read's, not the seed's
  await seed('pages', 'terms', 'en')
  await seed('notes', 'first', 'nb')
  for (const locale of ['da', 'sv', 'en', 'nb']) {
    if (locale === 'nb') await seed('pages', 'pricing', locale, 'draft')
    if (locale !== 'sv') await seed('pages', 'contact', locale)
    await seed('pages', 'about', locale)
  }
  return stores
}

describe('GET /api/translations/status', () => {
  it('reads every collection and locale in one query and answers the locales of each slug', async () => {
    const stores = await seeded()

    const { status, body } = await translationStatus(request, testContext(editor, stores, nordic))

    expect(status).toBe(200)
    expect(stores.adapter.queries).toHaveLength(1)
    expect(stores.adapter.queries[0]).toMatchObject({ projection: 'meta', state: 'current' })
    expect(stores.adapter.queries[0]?.locale).toBeUndefined()
    // Slugs in slug order; each slug's supported locales first in their order, then any other
    // a document has
    expect(body).toEqual({
      supportedLocales: ['nb', 'en', 'sv'],
      defaultLocale: 'nb',
      collections: [
        {
          collection: 'pages',
          total: 4,
          items: [
            { slug: 'about', locales: ['nb', 'en', 'sv', 'da'], missing: [] },
            { slug: 'contact', locales: ['nb', 'en', 'da'], missing: ['sv'] },
            { slug: 'pricing', locales: ['nb'], missing: ['en', 'sv'] },
            { slug: 'terms', locales: ['en'], missing: ['nb', 'sv'] },
          ],
        },
        { collection: 'articles', total: 0, items: [] },
        { collection: 'faq', total: 0, items: [] },
        {
          collection: 'notes',
          total: 1,
          items: [{ slug: 'first', locales: ['nb'], missing: ['en', 'sv'] }],
        },
      ],
    })
  })

  it('reads nothing on a single-locale site', async () => {
    const stores = await seeded()

    const { body } = await translationStatus(request, testContext(editor, stores))

    expect(body).toMatchObject({ collections: [] })
    expect(stores.adapter.queries).toHaveLength(0)
  })

  it('answers 501 for an adapter that cannot query', async () => {
    const stores = await seeded()
    Object.defineProperty(stores.adapter, 'query', { value: undefined })

    const { status } = await translationStatus(request, testContext(editor, stores, nordic))

    expect(status).toBe(501)
  })
})
