import type { IPageCacheStore } from '@krantho/persistence'
import { describe, expect, it, vi } from 'vitest'
import { bulkPublish } from '../src/handlers/bulk-publish.js'
import { publishImpact } from '../src/handlers/publish-impact.js'
import type { ApiRequest } from '../src/types.js'
import { editor, viewer } from './assistant/auth.js'
import { testConfig, testContext, testStores } from './assistant/fixtures.js'

function impactRequest(collection: string, slug: string): ApiRequest {
  return {
    method: 'GET',
    path: `/api/content/${collection}/${slug}/publish-impact`,
    params: { collection, slug },
    query: {},
  }
}

function countingStore(count: number): IPageCacheStore {
  return {
    get: vi.fn(async () => null),
    set: vi.fn(async () => {}),
    tagsRevalidatedSince: vi.fn(async () => 'fresh' as const),
    markTags: vi.fn(async () => {}),
    countTagged: vi.fn(async () => count),
  }
}

interface ImpactBody {
  paths: string[]
  lists: string[]
  everyPageReading: boolean
  caching: string
  tags: string[]
  cachedEntries: number | null
}

describe('GET /api/content/:collection/:slug/publish-impact', () => {
  it("names the document's page and its collection's lists, without a count when no cache is shared", async () => {
    const res = await publishImpact(
      impactRequest('pages', 'about'),
      testContext(editor, testStores()),
    )

    expect(res.status).toBe(200)
    const body = res.body as ImpactBody
    expect(body).toMatchObject({
      paths: ['/about'],
      lists: ['pages'],
      everyPageReading: false,
      caching: 'none',
      cachedEntries: null,
    })
    expect(body.tags.length).toBeGreaterThan(0)
  })

  it('counts the cached entries the change refreshes when the page cache is shared', async () => {
    const config = testConfig({ cache: { pages: 'next-isr', shared: 'database' } })
    const ctx = testContext(editor, testStores(), config)
    const store = countingStore(3)
    ctx.pageCacheStore = store

    const res = await publishImpact(impactRequest('pages', 'about'), ctx)

    const body = res.body as ImpactBody
    expect(body).toMatchObject({ caching: 'next-isr', cachedEntries: 3 })
    expect(store.countTagged).toHaveBeenCalledWith(body.tags)
  })

  it('refuses a viewer', async () => {
    const res = await publishImpact(
      impactRequest('pages', 'about'),
      testContext(viewer, testStores()),
    )
    expect(res.status).toBe(403)
  })
})

describe('POST /api/content/:collection/bulk-publish', () => {
  it('publishes each slug in the locale the body names, and reports the ones that fail', async () => {
    const stores = testStores()
    const config = testConfig({ site: { supportedLocales: ['en', 'nb'], defaultLocale: 'en' } })
    await stores.adapter.seed(
      { collection: 'pages', slug: 'about', locale: 'nb', fields: { title: 'Om oss' } },
      'draft',
    )
    await stores.adapter.seed(
      { collection: 'pages', slug: 'about', locale: 'en', fields: { title: 'About' } },
      'draft',
    )

    const res = await bulkPublish(
      {
        method: 'POST',
        path: '/api/content/pages/bulk-publish',
        params: { collection: 'pages' },
        query: {},
        body: { slugs: ['about', 'missing'], locale: 'nb' },
      },
      testContext(editor, stores, config),
    )

    expect(res.body).toMatchObject({
      published: 1,
      results: [
        { slug: 'about', published: true },
        { slug: 'missing', published: false },
      ],
    })
    expect(await stores.adapter.getPublished('pages', 'about', 'nb')).not.toBeNull()
    expect(await stores.adapter.getPublished('pages', 'about', 'en')).toBeNull()
  })
})
