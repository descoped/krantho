import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { resolveConfig } from '@krantho/config'
import type { CacheStats, ContentEngineConfig, ContentResult, IContentEngine } from '@krantho/core'
import type { ContentDocument, ContentMetadata, IPersistenceAdapter } from '@krantho/persistence'
import { authoredMetadata } from '@krantho/persistence'
import { defineCollection, defineConfig } from '@krantho/schema'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createApiHandlers } from '../src/create-api-handlers.js'
import type { ApiRequest } from '../src/types.js'

// --- Mocks ---

const pages = defineCollection({
  name: 'pages',
  source: 'filesystem',
  directory: 'content/pages',
  schema: z.object({
    title: z.string(),
  }),
})

const blog = defineCollection({
  name: 'blog',
  source: 'database',
  schema: z.object({
    title: z.string(),
  }),
})

const contentConfig = defineConfig({ collections: { pages, blog } })

const testOutputDir = join(process.cwd(), '.krantho', 'test')

const config = resolveConfig({
  site: {
    domain: 'test.example.com',
    name: 'Test Site',
    language: 'en',
    baseUrl: 'https://test.example.com',
  },
  paths: { seoGeneratedDir: testOutputDir },
})

beforeAll(() => {
  mkdirSync(testOutputDir, { recursive: true })
})

afterAll(() => {
  rmSync(testOutputDir, { recursive: true, force: true })
})

function makeResult(slug: string, overrides: Partial<ContentResult> = {}): ContentResult {
  return {
    fields: { title: slug, ...overrides.fields },
    content: `# ${slug}`,
    html: `<h1>${slug}</h1>`,
    sections: overrides.sections ?? {},
    metadata: {
      slug,
      lastModified: new Date('2026-03-29'),
      size: 100,
      processingTime: 1,
    },
    loading: false,
    error: overrides.error ?? null,
  }
}

function createMockEngine(): IContentEngine {
  return {
    loadContent: vi.fn(async (slug: string) => makeResult(slug)),
    getConfig: vi.fn(
      (): ContentEngineConfig => ({
        contentPath: '/content/',
        cacheEnabled: false,
        cacheTTL: 0,
        maxCacheSize: 100,
        enableAtNotation: false,
      }),
    ),
    clearCache: vi.fn(),
    getCacheStats: vi.fn(
      (): CacheStats => ({
        size: 0,
        hitRate: 0,
        totalRequests: 0,
        totalHits: 0,
        totalMisses: 0,
      }),
    ),
  }
}

function createMockAdapter(): IPersistenceAdapter {
  return {
    exists: vi.fn(async () => true),
    read: vi.fn(async () => '---\ntitle: Test\n---\n# Test'),
    getMetadata: vi.fn(
      async (): Promise<Pick<ContentMetadata, 'size' | 'lastModified'>> => ({
        size: 100,
        lastModified: new Date(),
      }),
    ),
    listSlugs: vi.fn(async () => ['home', 'about']),
    getContent: vi.fn(
      async (collection: string, slug: string): Promise<ContentDocument> => ({
        ...authoredMetadata({}),
        meta: {
          collection,
          slug,
          locale: 'en',
          version: 1,
          liveVersion: null,
          status: 'draft',
          source: 'api',
          changedBy: null,
          createdAt: '2026-01-01T00:00:00Z',
        },
        fields: { title: 'Home' },
        body: '# Home',
        html: '<h1>Home</h1>',
        sections: {},
      }),
    ),
    query: vi.fn(async () => ({ items: [], hasMore: false })),
    writeContent: vi.fn(async () => {}),
    deleteContent: vi.fn(async () => {}),
  }
}

function req(method: string, path: string, opts: Partial<ApiRequest> = {}): ApiRequest {
  return { method, path, params: {}, query: {}, ...opts }
}

// --- Tests ---

describe('createApiHandlers', () => {
  let engine: IContentEngine
  let adapter: IPersistenceAdapter
  let api: ReturnType<typeof createApiHandlers>

  beforeAll(() => {
    engine = createMockEngine()
    adapter = createMockAdapter()
    api = createApiHandlers({ contentConfig, config, adapter, engine })
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('route matching', () => {
    it('returns 404 for unknown routes', async () => {
      const res = await api.handle(req('GET', '/api/unknown'))
      expect(res.status).toBe(404)
    })
  })

  describe('GET /api/content/:collection', () => {
    it('lists collection content', async () => {
      const res = await api.handle(req('GET', '/api/content/blog'))
      expect(res.status).toBe(200)
      const body = res.body as { items: unknown[]; hasMore: boolean }
      expect(Array.isArray(body.items)).toBe(true)
      expect(body.hasMore).toBe(false)
    })

    it('returns 404 for unknown collection', async () => {
      const res = await api.handle(req('GET', '/api/content/nonexistent'))
      expect(res.status).toBe(404)
    })
  })

  describe('GET /api/content/:collection/:slug', () => {
    it('returns content item', async () => {
      const res = await api.handle(req('GET', '/api/content/pages/home'))
      expect(res.status).toBe(200)
      const body = res.body as { meta: { slug: string; collection: string } }
      expect(body.meta.slug).toBe('home')
      expect(body.meta.collection).toBe('pages')
    })
  })

  describe('POST /api/content/:collection', () => {
    /** The mock reads every slug as an existing document: a create's slug is a new one */
    function noDocumentYet(): void {
      vi.mocked(adapter.getContent)?.mockResolvedValueOnce(null)
    }

    it('creates content with valid fields', async () => {
      noDocumentYet()
      const res = await api.handle(
        req('POST', '/api/content/blog', {
          body: {
            slug: 'new-post',
            fields: { title: 'New Post' },
            body: '# New',
          },
        }),
      )
      expect(res.status).toBe(201)
    })

    it('returns 422 for invalid fields', async () => {
      noDocumentYet()
      const res = await api.handle(
        req('POST', '/api/content/blog', {
          body: { slug: 'bad-post', fields: {}, body: '' },
        }),
      )
      expect(res.status).toBe(422)
    })

    it('refuses with 409 a create of a document that already exists', async () => {
      const res = await api.handle(
        req('POST', '/api/content/blog', {
          body: { slug: 'hello-world', fields: { title: 'Again' }, body: '' },
        }),
      )
      expect(res.status).toBe(409)
      expect(res.body).toMatchObject({ error: expect.stringContaining('already exists') })
      expect(adapter.writeContent).not.toHaveBeenCalled()
    })

    it('returns 400 for missing slug', async () => {
      const res = await api.handle(
        req('POST', '/api/content/blog', {
          body: { fields: { title: 'No Slug' } },
        }),
      )
      expect(res.status).toBe(400)
    })
  })

  describe('DELETE /api/content/:collection/:slug', () => {
    it('deletes content', async () => {
      const res = await api.handle(req('DELETE', '/api/content/blog/post-1'))
      expect(res.status).toBe(200)
    })
  })

  describe('POST /api/content/:collection/:slug/publish', () => {
    it('publishes content', async () => {
      const res = await api.handle(req('POST', '/api/content/pages/home/publish'))
      expect(res.status).toBe(200)
    })
  })

  describe('POST /api/validate', () => {
    it('validates all content', async () => {
      const res = await api.handle(req('POST', '/api/validate'))
      expect(res.status === 200 || res.status === 422).toBe(true)
    })
  })

  describe('GET /api/collections', () => {
    it('returns list of all collections', async () => {
      const res = await api.handle(req('GET', '/api/collections'))
      expect(res.status).toBe(200)
      const body = res.body as { collections: Array<{ name: string; source: string }> }
      expect(body.collections).toHaveLength(2)
      const names = body.collections.map((c) => c.name)
      expect(names).toContain('pages')
      expect(names).toContain('blog')
    })

    it('includes source type for each collection', async () => {
      const res = await api.handle(req('GET', '/api/collections'))
      const body = res.body as { collections: Array<{ name: string; source: string }> }
      const pages = body.collections.find((c) => c.name === 'pages')
      expect(pages?.source).toBe('filesystem')
      const blog = body.collections.find((c) => c.name === 'blog')
      expect(blog?.source).toBe('database')
    })

    it('says whether each collection renders pages', async () => {
      const res = await api.handle(req('GET', '/api/collections'))
      const body = res.body as { collections: Array<{ name: string; pages: boolean }> }
      // Neither declares a `path`: both render pages under the default rule
      expect(body.collections.every((c) => c.pages)).toBe(true)
    })

    it('returns the path each collection declares, and none for the default rule', async () => {
      const schema = z.object({ title: z.string() })
      const pathed = createApiHandlers({
        contentConfig: defineConfig({
          collections: {
            pages: defineCollection({ name: 'pages', source: 'database', schema }),
            hosts: defineCollection({
              name: 'hosts',
              source: 'database',
              schema,
              path: '/deploy/:slug',
            }),
            faq: defineCollection({ name: 'faq', source: 'database', schema, path: false }),
          },
        }),
        config,
        adapter: createMockAdapter(),
        engine: createMockEngine(),
      })
      const res = await pathed.handle(req('GET', '/api/collections'))
      const body = res.body as {
        collections: Array<{ name: string; pages: boolean; path?: string | false }>
      }
      const byName = new Map(body.collections.map((c) => [c.name, c]))
      expect(byName.get('hosts')).toMatchObject({ pages: true, path: '/deploy/:slug' })
      expect(byName.get('faq')).toMatchObject({ pages: false, path: false })
      expect(byName.get('pages')).not.toHaveProperty('path')
    })
  })

  describe('GET /api/schema/:collection', () => {
    it('returns JSON Schema for a collection', async () => {
      const res = await api.handle(req('GET', '/api/schema/pages'))
      expect(res.status).toBe(200)
      const body = res.body as { name: string; source: string; schema: Record<string, unknown> }
      expect(body.name).toBe('pages')
      expect(body.source).toBe('filesystem')
      expect(body.schema.type).toBe('object')
      const props = body.schema.properties as Record<string, Record<string, unknown>>
      expect(props.title?.type).toBe('string')
    })

    it('returns 404 for unknown collection', async () => {
      const res = await api.handle(req('GET', '/api/schema/nonexistent'))
      expect(res.status).toBe(404)
    })
  })

  describe('GET /api/page', () => {
    it('returns 501 when no pages registered', async () => {
      const res = await api.handle(req('GET', '/api/page', { query: { route: '/' } }))
      expect(res.status).toBe(501)
    })

    it('returns 400 without route param', async () => {
      const res = await api.handle(req('GET', '/api/page'))
      expect(res.status).toBe(400)
    })
  })

  describe('GET /api/seo/status', () => {
    it('returns SEO file status', async () => {
      const res = await api.handle(req('GET', '/api/seo/status'))
      expect(res.status).toBe(200)
      const body = res.body as Record<string, { exists: boolean }>
      expect(body).toHaveProperty('structuredData')
      expect(body).toHaveProperty('faqPages')
      expect(body).toHaveProperty('llmsTxt')
      expect(body).toHaveProperty('sitemap')
      expect(body).toHaveProperty('contentDates')
      expect(typeof body.structuredData!.exists).toBe('boolean')
    })
  })

  describe('GET /api/seo/structured-data', () => {
    it('returns 404 when file does not exist', async () => {
      const res = await api.handle(req('GET', '/api/seo/structured-data'))
      expect(res.status).toBe(404)
    })
  })

  describe('GET /api/seo/preview/:collection/:slug', () => {
    it('returns JSON-LD preview for content', async () => {
      const res = await api.handle(req('GET', '/api/seo/preview/pages/home'))
      expect(res.status).toBe(200)
      const body = res.body as Record<string, unknown>
      expect(body['@context']).toBe('https://schema.org')
      // @krantho/seo is available in workspace — composeGraph produces @graph
      expect(body['@graph']).toBeDefined()
    })

    it('places the document at the path its collection renders it', async () => {
      const schema = z.object({ title: z.string() })
      const pathed = createApiHandlers({
        contentConfig: defineConfig({
          collections: {
            pages: defineCollection({ name: 'pages', source: 'database', schema }),
            hosts: defineCollection({
              name: 'hosts',
              source: 'database',
              schema,
              path: '/deploy/:slug',
            }),
            faq: defineCollection({ name: 'faq', source: 'database', schema, path: false }),
          },
        }),
        config,
        adapter: createMockAdapter(),
        engine: createMockEngine(),
      })
      const preview = async (path: string) =>
        JSON.stringify((await pathed.handle(req('GET', `/api/seo/preview/${path}`))).body)

      expect(await preview('pages/about')).toContain('"https://test.example.com/about"')
      expect(await preview('hosts/vercel')).toContain('"https://test.example.com/deploy/vercel"')
      expect(await preview('hosts/vercel')).not.toContain('/hosts/')
      // A document without a page has no page for entities to describe
      expect(JSON.parse(await preview('faq/refunds'))).toEqual({
        '@context': 'https://schema.org',
        '@graph': [],
      })
    })

    it('returns 404 for unknown collection', async () => {
      const res = await api.handle(req('GET', '/api/seo/preview/nonexistent/foo'))
      expect(res.status).toBe(404)
    })

    it('returns 404 when slug does not exist', async () => {
      const notFoundAdapter = { ...createMockAdapter(), getContent: vi.fn(async () => null) }
      const notFoundApi = createApiHandlers({
        contentConfig,
        config,
        adapter: notFoundAdapter,
        engine: createMockEngine(),
      })
      const res = await notFoundApi.handle(req('GET', '/api/seo/preview/pages/missing'))
      expect(res.status).toBe(404)
    })

    it('composes the named document in its collection and locale, not another with its slug', async () => {
      const res = await api.handle(
        req('GET', '/api/seo/preview/pages/home', { query: { locale: 'nb' } }),
      )
      expect(res.status).toBe(200)
      expect(adapter.getContent).toHaveBeenCalledWith('pages', 'home', 'nb')
      expect(engine.loadContent).not.toHaveBeenCalled()
    })

    it('answers 400 for a locale that is not a locale code, never the default locale’s document', async () => {
      const res = await api.handle(
        req('GET', '/api/seo/preview/pages/home', { query: { locale: 'not a locale' } }),
      )
      expect(res.status).toBe(400)
      expect(adapter.getContent).not.toHaveBeenCalledWith('pages', 'home', undefined)
    })

    it('answers 501 when the adapter cannot read a document', async () => {
      const { getContent: _unread, ...unreadable } = createMockAdapter()
      const unreadableApi = createApiHandlers({
        contentConfig,
        config,
        adapter: unreadable,
        engine: createMockEngine(),
      })
      const res = await unreadableApi.handle(req('GET', '/api/seo/preview/pages/home'))
      expect(res.status).toBe(501)
    })
  })

  describe('GET /api/seo/sitemap', () => {
    it('returns sitemap XML', async () => {
      const res = await api.handle(req('GET', '/api/seo/sitemap'))
      expect(res.status).toBe(200)
      const body = res.body as string
      expect(body).toContain('<?xml')
      expect(body).toContain('<urlset')
    })
  })

  describe('HEAD', () => {
    it('answers as GET does, without the body, keeping the content type', async () => {
      const res = await api.handle(req('HEAD', '/api/seo/sitemap'))
      expect(res.status).toBe(200)
      expect(res.body).toBeNull()
      expect(res.headers?.['content-type']).toBe('application/xml; charset=utf-8')
    })

    it('keeps the JSON content type a GET body would have been served with', async () => {
      const get = await api.handle(req('GET', '/api/collections'))
      const head = await api.handle(req('HEAD', '/api/collections'))
      expect(head.status).toBe(get.status)
      expect(head.body).toBeNull()
      expect(head.headers?.['content-type']).toBe('application/json')
    })

    it('answers 404 where GET does, and for a route with no GET', async () => {
      expect((await api.handle(req('HEAD', '/api/nothing-here'))).status).toBe(404)
      expect((await api.handle(req('HEAD', '/api/seo/generate'))).status).toBe(404)
    })
  })

  describe('POST /api/seo/generate', () => {
    it('returns generation results', async () => {
      const res = await api.handle(req('POST', '/api/seo/generate'))
      expect(res.status).toBe(200)
      const body = res.body as { results: Record<string, string> }
      expect(body.results).toHaveProperty('sitemap')
    })
  })

  describe('GET /api/content/search', () => {
    it('returns 400 for empty query', async () => {
      const res = await api.handle(req('GET', '/api/content/search', { query: { q: '' } }))
      expect(res.status).toBe(400)
    })

    it('searches across collections', async () => {
      const res = await api.handle(req('GET', '/api/content/search', { query: { q: 'post' } }))
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ items: [], hasMore: false })
    })
  })

  describe('DELETE /api/content/:collection/bulk', () => {
    it('bulk deletes items', async () => {
      const res = await api.handle(
        req('DELETE', '/api/content/blog/bulk', {
          body: { slugs: ['post-1'] },
        }),
      )
      expect(res.status).toBe(200)
      const body = res.body as { deleted: number }
      expect(typeof body.deleted).toBe('number')
    })

    it('returns 400 for missing slugs', async () => {
      const res = await api.handle(req('DELETE', '/api/content/blog/bulk', { body: {} }))
      expect(res.status).toBe(400)
    })

    it('returns 400 for an empty or malformed locale, and deletes nothing', async () => {
      for (const locale of ['', 'not a locale', 42]) {
        const res = await api.handle(
          req('DELETE', '/api/content/blog/bulk', { body: { slugs: ['post-1'], locale } }),
        )
        expect(res.status).toBe(400)
      }
      expect(adapter.deleteContent).not.toHaveBeenCalled()
    })

    it('deletes in the locale it is given', async () => {
      const res = await api.handle(
        req('DELETE', '/api/content/blog/bulk', { body: { slugs: ['post-1'], locale: 'nb' } }),
      )
      expect(res.status).toBe(200)
      expect(adapter.deleteContent).toHaveBeenCalledWith('blog', 'post-1', 'nb')
    })
  })

  describe('POST /api/content/:collection/bulk-publish', () => {
    it('bulk publishes items', async () => {
      const res = await api.handle(
        req('POST', '/api/content/blog/bulk-publish', {
          body: { slugs: ['post-1'] },
        }),
      )
      expect(res.status).toBe(200)
      const body = res.body as { published: number }
      expect(typeof body.published).toBe('number')
    })
  })

  describe('GET /api/site-config', () => {
    it('returns site configuration', async () => {
      const res = await api.handle(req('GET', '/api/site-config'))
      expect(res.status).toBe(200)
      const body = res.body as { site: { domain: string }; collections: unknown[] }
      expect(body.site.domain).toBe('test.example.com')
      expect(Array.isArray(body.collections)).toBe(true)
      expect(body.collections.length).toBe(2)
    })

    it('says how pages are cached', async () => {
      const res = await api.handle(req('GET', '/api/site-config'))
      expect((res.body as { cache: unknown }).cache).toEqual({ pages: 'none', shared: 'none' })
    })
  })

  describe('GET /api/capabilities', () => {
    it('reports no framework when the API is created without one', async () => {
      const res = await api.handle(req('GET', '/api/capabilities'))
      expect(res.status).toBe(200)
      expect((res.body as { framework: unknown }).framework).toBeNull()
    })

    it('reports the server package hosting the API', async () => {
      for (const framework of ['next', 'sveltekit', 'node'] as const) {
        const hosted = createApiHandlers({ contentConfig, config, adapter, engine, framework })
        const res = await hosted.handle(req('GET', '/api/capabilities'))
        expect((res.body as { framework: unknown }).framework).toBe(framework)
      }
    })
  })

  describe('GET /api/content/:collection (pagination)', () => {
    it('answers whether another page follows, with no total', async () => {
      const res = await api.handle(
        req('GET', '/api/content/blog', { query: { limit: '10', offset: '0' } }),
      )
      expect(res.status).toBe(200)
      const body = res.body as { items: unknown[]; hasMore: boolean; total?: number }
      expect(typeof body.hasMore).toBe('boolean')
      expect(body.total).toBeUndefined()
    })
  })
})
