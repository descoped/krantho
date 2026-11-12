import { resolveConfig } from '@krantho/config'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { seoEnrich } from '../src/handlers/seo-enrich.js'
import { jobStore } from '../src/handlers/seo-enrich-runner.js'
import type { ApiContext, ApiResponse } from '../src/types.js'

const site = {
  domain: 'example.com',
  name: 'Example',
  language: 'en',
  baseUrl: 'https://example.com',
}

/** Two collections that share a slug: `pages/home` and `services/home` */
const SLUGS: Readonly<Record<string, readonly string[]>> = {
  pages: ['home', 'about'],
  services: ['home', 'strategy'],
}

/** A context whose jobs settle at once: every model call fails, offline */
function context(running: Promise<unknown>[]): ApiContext {
  return {
    config: resolveConfig({ site }, {}, { cwd: '/srv/site' }),
    auth: { id: 'u', email: 'a@example.com', name: 'Admin', roles: ['admin'], mode: 'none' },
    contentConfig: {
      collections: new Map([
        ['pages', {}],
        ['services', {}],
      ]),
    },
    adapter: {
      query: async (spec: { collections: string[] }) => ({
        items: spec.collections.flatMap((collection) =>
          (SLUGS[collection] ?? []).map((slug) => ({ collection, slug, locale: 'en' })),
        ),
        hasMore: false,
      }),
      getContent: async () => ({ meta: {}, fields: { title: 'Home' }, body: 'Body. '.repeat(80) }),
      writeContent: async () => {},
    },
    siteSettingsAdapter: {
      getSetting: async (key: string) => (key === 'llm.provider' ? 'ollama' : null),
    },
    waitUntil: (work: Promise<unknown>) => {
      running.push(work)
    },
  } as unknown as ApiContext
}

/** Start a job with the body; the documents it enriches, once it has settled */
async function enrich(body: Record<string, unknown>): Promise<{
  response: ApiResponse
  items: string[]
}> {
  const running: Promise<unknown>[] = []
  const response = await seoEnrich(
    { method: 'POST', path: '', params: {}, query: {}, headers: {}, body },
    context(running),
  )
  const items = running.length > 0 ? (jobStore.get()?.items ?? []) : []
  await Promise.all(running)
  return { response, items: items.map((item) => `${item.collection}/${item.slug}`) }
}

describe('POST /api/seo/enrich scope', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function offline(): void {
    vi.stubGlobal('fetch', async () => {
      throw new Error('offline')
    })
  }

  it('enriches every collection for the site', async () => {
    offline()
    const { response, items } = await enrich({ scope: 'all' })
    expect(response.status).toBe(202)
    expect(items).toEqual(['pages/home', 'pages/about', 'services/home', 'services/strategy'])
  })

  it("changes only that collection's documents for a collection scope (#296)", async () => {
    offline()
    const { items } = await enrich({ scope: 'collection', collection: 'services' })
    expect(items).toEqual(['services/home', 'services/strategy'])
  })

  it('reads a named collection without a scope as the collection scope', async () => {
    offline()
    const { items } = await enrich({ collection: 'pages' })
    expect(items).toEqual(['pages/home', 'pages/about'])
  })

  it('enriches one document of one collection for an item, never a namesake elsewhere', async () => {
    offline()
    const { items } = await enrich({ scope: 'item', collection: 'services', slug: 'home' })
    expect(items).toEqual(['services/home'])
  })

  it('refuses a scope it cannot place', async () => {
    offline()
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ scope: 'collection' }, 'scope collection needs a configured collection'],
      [
        { scope: 'collection', collection: 'nope' },
        'scope collection needs a configured collection',
      ],
      [{ scope: 'item', slug: 'home' }, 'scope item needs a configured collection'],
      [{ scope: 'item', collection: 'pages' }, 'scope item needs a slug'],
      [{ scope: 'everything' }, 'scope is all, collection or item'],
    ]
    for (const [body, error] of cases) {
      const { response, items } = await enrich(body)
      expect(response.status, JSON.stringify(body)).toBe(400)
      expect(response.body).toEqual({ error })
      expect(items).toEqual([])
    }
  })
})
