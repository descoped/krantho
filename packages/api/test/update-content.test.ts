import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { resolveConfig } from '@krantho/config'
import type { CacheStats, ContentEngineConfig, ContentResult, IContentEngine } from '@krantho/core'
import type { ContentDocument, ContentMetadata, IPersistenceAdapter } from '@krantho/persistence'
import { defineCollection, defineConfig } from '@krantho/schema'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createApiHandlers } from '../src/create-api-handlers.js'
import type { ApiRequest } from '../src/types.js'

// --- Mocks ---

const blog = defineCollection({
  name: 'blog',
  source: 'database',
  schema: z.object({
    title: z.string(),
  }),
})

const contentConfig = defineConfig({ collections: { blog } })

const testOutputDir = join(process.cwd(), '.krantho', 'test-update-content')

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

function makeDoc(version: number, locale = 'en'): ContentDocument {
  return {
    meta: {
      collection: 'blog',
      slug: 'post-1',
      locale,
      version,
      liveVersion: 1,
      status: 'published',
      source: 'api',
      changedBy: null,
      createdAt: '2026-01-01T00:00:00Z',
    },
    fields: { title: 'Post 1' },
    body: '# Post 1',
    html: '<h1>Post 1</h1>',
    sections: {},
  }
}

function createMockEngine(): IContentEngine {
  return {
    loadContent: vi.fn(
      async (slug: string): Promise<ContentResult> => ({
        fields: { title: slug },
        content: `# ${slug}`,
        html: `<h1>${slug}</h1>`,
        sections: {},
        metadata: { slug, lastModified: new Date('2026-03-29'), size: 100, processingTime: 1 },
        loading: false,
        error: null,
      }),
    ),
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

const getContentMock = vi.fn<NonNullable<IPersistenceAdapter['getContent']>>(async () => makeDoc(1))
const writeContentMock = vi.fn<NonNullable<IPersistenceAdapter['writeContent']>>(async () => {})

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
    listSlugs: vi.fn(async () => ['post-1']),
    getContent: getContentMock,
    writeContent: writeContentMock,
    deleteContent: vi.fn(async () => {}),
  }
}

function req(method: string, path: string, opts: Partial<ApiRequest> = {}): ApiRequest {
  return { method, path, params: {}, query: {}, ...opts }
}

// --- Tests ---

describe('PUT /api/content/:collection/:slug', () => {
  let api: ReturnType<typeof createApiHandlers>

  beforeAll(() => {
    const adapter = createMockAdapter()
    api = createApiHandlers({ contentConfig, config, adapter, engine: createMockEngine() })
  })

  beforeEach(() => {
    vi.clearAllMocks()
    getContentMock.mockResolvedValue(makeDoc(1))
  })

  it('writes fields and body when body is present', async () => {
    const res = await api.handle(
      req('PUT', '/api/content/blog/post-1', {
        body: { fields: { title: 'Updated' }, body: '# Updated' },
      }),
    )
    expect(res.status).toBe(200)
    expect(writeContentMock).toHaveBeenCalledOnce()
    const [data] = writeContentMock.mock.calls[0] ?? []
    expect(data).toMatchObject({ collection: 'blog', slug: 'post-1', body: '# Updated' })
  })

  it('erases the body when an empty string is submitted', async () => {
    const res = await api.handle(
      req('PUT', '/api/content/blog/post-1', {
        body: { fields: { title: 'Updated' }, body: '' },
      }),
    )
    expect(res.status).toBe(200)
    expect(writeContentMock).toHaveBeenCalledOnce()
    const [data] = writeContentMock.mock.calls[0] ?? []
    expect(data).toMatchObject({ body: '' })
  })

  it('updates fields only when no body key is submitted, keeping the body and the live version', async () => {
    const res = await api.handle(
      req('PUT', '/api/content/blog/post-1', {
        body: { fields: { title: 'Updated' } },
      }),
    )
    expect(res.status).toBe(200)
    expect(writeContentMock).toHaveBeenCalledOnce()
    const [data] = writeContentMock.mock.calls[0] ?? []
    expect(data).toMatchObject({
      fields: { title: 'Updated' },
      body: '# Post 1',
    })
    expect(data?.publication).toBeUndefined()
    expect(res.body).toMatchObject({ slug: 'post-1', version: 1, liveVersion: 1 })
  })

  it('passes the submitted locale through to writeContent', async () => {
    getContentMock.mockResolvedValue(makeDoc(1, 'nb'))
    const res = await api.handle(
      req('PUT', '/api/content/blog/post-1', {
        body: { fields: { title: 'Oppdatert' }, body: '# Oppdatert', locale: 'nb' },
      }),
    )
    expect(res.status).toBe(200)
    const [data] = writeContentMock.mock.calls[0] ?? []
    expect(data).toMatchObject({ locale: 'nb' })
  })

  it('leaves locale undefined when not submitted', async () => {
    const res = await api.handle(
      req('PUT', '/api/content/blog/post-1', {
        body: { fields: { title: 'Updated' }, body: '# Updated' },
      }),
    )
    expect(res.status).toBe(200)
    const [data] = writeContentMock.mock.calls[0] ?? []
    expect(data?.locale).toBeUndefined()
  })

  it('checks the submitted version against the requested locale', async () => {
    getContentMock.mockResolvedValue(makeDoc(1, 'nb'))
    const res = await api.handle(
      req('PUT', '/api/content/blog/post-1', {
        body: { fields: { title: 'Oppdatert' }, body: '# Oppdatert', locale: 'nb', _version: 1 },
      }),
    )
    expect(res.status).toBe(200)
    expect(getContentMock).toHaveBeenCalledWith('blog', 'post-1', 'nb')
  })

  it('returns 409 when the submitted version is stale', async () => {
    getContentMock.mockResolvedValueOnce(makeDoc(2))
    const res = await api.handle(
      req('PUT', '/api/content/blog/post-1', {
        body: { fields: { title: 'Updated' }, body: '# Updated', _version: 1 },
      }),
    )
    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({ currentVersion: 2, yourVersion: 1 })
    expect(writeContentMock).not.toHaveBeenCalled()
  })
})
