import { type KranthoConfigInput, resolveConfig } from '@krantho/config'
import type { CacheStats, ContentEngineConfig, ContentResult, IContentEngine } from '@krantho/core'
import type {
  ContentMetadata,
  ContentQuery,
  IFileStore,
  IMediaFolderStorage,
  IMediaMetadataAdapter,
  IPersistenceAdapter,
  MediaListOptions,
} from '@krantho/persistence'
import { defineCollection, defineConfig } from '@krantho/schema'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createApiHandlers } from '../src/create-api-handlers.js'
import type { ApiRequest } from '../src/types.js'
import { applyListLimit } from '../src/validators.js'

const blog = defineCollection({
  name: 'blog',
  source: 'database',
  schema: z.object({ title: z.string() }),
})

const contentConfig = defineConfig({ collections: { blog } })

function buildConfig(overrides: KranthoConfigInput = {}) {
  return resolveConfig({
    site: {
      domain: 'test.example.com',
      name: 'Test Site',
      language: 'en',
      baseUrl: 'https://test.example.com',
    },
    ...overrides,
  })
}

function createEngine(): IContentEngine {
  return {
    loadContent: vi.fn(async (): Promise<ContentResult> => {
      throw new Error('not used')
    }),
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

const query = vi.fn(async (_spec: ContentQuery) => ({ items: [], hasMore: false }))

function createAdapter(): IPersistenceAdapter {
  return {
    exists: vi.fn(async () => true),
    read: vi.fn(async () => ''),
    getMetadata: vi.fn(
      async (): Promise<Pick<ContentMetadata, 'size' | 'lastModified'>> => ({
        size: 0,
        lastModified: new Date(),
      }),
    ),
    listSlugs: vi.fn(async () => []),
    query,
    writeContent: vi.fn(async () => {}),
    deleteContent: vi.fn(async () => {}),
  }
}

function req(path: string, query: Record<string, string> = {}): ApiRequest {
  return { method: 'GET', path, params: {}, query }
}

const mediaListCall = vi.fn(async (_options?: MediaListOptions) => ({ items: [], total: 0 }))

// Only `list` is exercised; the rest of the media surface is never reached.
const media = {
  metadata: { list: mediaListCall } as unknown as IMediaMetadataAdapter,
  folders: {} as IMediaFolderStorage,
  files: { label: 'Test store', location: null } as IFileStore,
}

function handlersFor(overrides: KranthoConfigInput = {}) {
  return createApiHandlers({
    contentConfig,
    config: buildConfig(overrides),
    adapter: createAdapter(),
    engine: createEngine(),
    media,
  })
}

/** The limit media storage was actually asked for on the most recent list call */
function mediaLimitSeen(): number | undefined {
  return mediaListCall.mock.calls.at(-1)?.[0]?.limit
}

/** The limit the adapter was actually asked for on the most recent list call */
function limitSeen(): number | undefined {
  return query.mock.calls.at(-1)?.[0].limit
}

describe('content.list.maxLimit', () => {
  beforeEach(() => {
    query.mockClear()
  })

  describe('unset — the shipped default', () => {
    it('leaves a list without a limit unbounded', async () => {
      const api = handlersFor()
      await api.handle(req('/api/content/blog'))
      expect(limitSeen()).toBeUndefined()
    })

    it('passes a requested limit through untouched', async () => {
      const api = handlersFor()
      await api.handle(req('/api/content/blog', { limit: '5000' }))
      expect(limitSeen()).toBe(5000)
    })
  })

  describe('set', () => {
    const capped: KranthoConfigInput = { content: { list: { maxLimit: 25 } } }

    it('imposes the cap as the page size when no limit is requested', async () => {
      const api = handlersFor(capped)
      await api.handle(req('/api/content/blog'))
      expect(limitSeen()).toBe(25)
    })

    it('caps a larger requested limit', async () => {
      const api = handlersFor(capped)
      await api.handle(req('/api/content/blog', { limit: '100' }))
      expect(limitSeen()).toBe(25)
    })

    it('leaves a smaller requested limit alone', async () => {
      const api = handlersFor(capped)
      await api.handle(req('/api/content/blog', { limit: '10' }))
      expect(limitSeen()).toBe(10)
    })
  })
})

describe('applyListLimit', () => {
  it('returns a valid request untouched when no cap is set', () => {
    expect(applyListLimit(undefined, undefined)).toBeUndefined()
    expect(applyListLimit(0, undefined)).toBe(0)
    expect(applyListLimit(5000, undefined)).toBe(5000)
  })

  it('treats a negative or NaN request as no request', () => {
    expect(applyListLimit(-1, undefined)).toBeUndefined()
    expect(applyListLimit(Number.NaN, undefined)).toBeUndefined()
    expect(applyListLimit(-1, 25)).toBe(25)
    expect(applyListLimit(Number.NaN, 25)).toBe(25)
  })
})

describe('GET /api/media limit', () => {
  beforeEach(() => {
    mediaListCall.mockClear()
  })

  const capped: KranthoConfigInput = { content: { list: { maxLimit: 25 } } }

  it('passes a requested limit through untouched when no cap is set', async () => {
    const api = handlersFor()
    await api.handle(req('/api/media', { limit: '5000' }))
    expect(mediaLimitSeen()).toBe(5000)
  })

  it('treats limit=-1 as no limit when no cap is set', async () => {
    const api = handlersFor()
    await api.handle(req('/api/media', { limit: '-1' }))
    expect(mediaLimitSeen()).toBeUndefined()
  })

  it.each(['-1', 'abc', ''])('applies the cap to limit=%j', async (limit) => {
    const api = handlersFor(capped)
    await api.handle(req('/api/media', { limit }))
    expect(mediaLimitSeen()).toBe(25)
  })

  it('caps a larger requested limit', async () => {
    const api = handlersFor(capped)
    await api.handle(req('/api/media', { limit: '100' }))
    expect(mediaLimitSeen()).toBe(25)
  })
})
