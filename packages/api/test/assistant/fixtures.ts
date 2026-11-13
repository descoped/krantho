import { type KranthoConfigInput, resolveConfig } from '@krantho/config'
import type { CacheStats, ContentEngineConfig, IContentEngine } from '@krantho/core'
import {
  defineCollection,
  defineConfig,
  defineDocumentArchetype,
  defineMetadataArchetype,
  sharingMetadata,
} from '@krantho/schema'
import { DOCUMENT_SEO_METADATA_SCHEMA } from '@krantho/seo-shared'
import { vi } from 'vitest'
import { z } from 'zod'
import { createApiHandlers } from '../../src/create-api-handlers.js'
import { signJwt } from '../../src/jwt.js'
import type { ApiContext, ApiRequest, AuthenticatedUser } from '../../src/types.js'
import { fakeVault } from '../fake-vault.js'
import { MemoryAdapter, MemoryLocks, MemorySeoConfigs, MemorySettings } from './memory-adapter.js'

export const pages = defineCollection({
  name: 'pages',
  source: 'database',
  archetype: defineDocumentArchetype({
    id: 'test/page',
    label: 'Page',
    fields: z.object({
      title: z.string(),
      description: z.string().optional(),
    }),
    metadata: {
      sharing: { archetype: sharingMetadata },
      seo: {
        archetype: defineMetadataArchetype({
          id: 'test/structured-data',
          label: 'Structured data',
          schema: z.fromJSONSchema(DOCUMENT_SEO_METADATA_SCHEMA) as z.ZodObject,
        }),
      },
    },
  }),
})

export const articles = defineCollection({
  name: 'articles',
  source: 'database',
  schema: z.object({
    title: z.string(),
    'answer-summary': z.string().optional(),
  }),
})

export const faq = defineCollection({
  name: 'faq',
  source: 'database',
  schema: z.object({
    question: z.string(),
    answer: z.string(),
    title: z.string().optional(),
  }),
})

export const notes = defineCollection({
  name: 'notes',
  source: 'database',
  schema: z.object({ title: z.string(), category: z.string() }),
})

export const contentConfig = defineConfig({ collections: { pages, articles, faq, notes } })

export const JWT_SECRET = 'assistant-test-secret-assistant-test-secret'

/** A resolved configuration with the assistant on and token auth */
export function testConfig(input: KranthoConfigInput = {}): ApiContext['config'] {
  return resolveConfig(
    {
      ...input,
      site: {
        domain: 'example.com',
        name: 'Example Site',
        language: 'en',
        baseUrl: 'https://example.com',
        ...input.site,
      },
      auth: {
        mode: 'token',
        token: { secret: 'static-token' },
        jwtSecret: JWT_SECRET,
        ...input.auth,
      },
      assistant: { enabled: true, ...input.assistant },
    },
    {},
    { cwd: '/srv/site' },
  )
}

/** An engine stand-in: the handlers only clear its cache */
export function testEngine(): IContentEngine {
  return {
    loadContent: vi.fn(async () => {
      throw new Error('not used')
    }),
    getConfig: vi.fn(
      (): ContentEngineConfig => ({
        contentPath: '/',
        cacheEnabled: false,
        cacheTTL: 0,
        maxCacheSize: 0,
        enableAtNotation: false,
      }),
    ),
    clearCache: vi.fn(),
    getCacheStats: vi.fn(
      (): CacheStats => ({ size: 0, hitRate: 0, totalRequests: 0, totalHits: 0, totalMisses: 0 }),
    ),
  }
}

/** Everything a test context holds, for assertions */
export interface TestStores {
  adapter: MemoryAdapter
  settings: MemorySettings
  seo: MemorySeoConfigs
  locks: MemoryLocks
}

/** The default locale is the site's: `testConfig()`'s primary language unless a test sets another */
export function testStores(defaultLocale = 'en'): TestStores {
  return {
    adapter: new MemoryAdapter(defaultLocale),
    settings: new MemorySettings(),
    seo: new MemorySeoConfigs(),
    locks: new MemoryLocks(),
  }
}

/** A handler context for `user` over the stores */
export function testContext(
  user: AuthenticatedUser | undefined,
  stores: TestStores,
  config: ApiContext['config'] = testConfig(),
): ApiContext {
  return {
    contentConfig,
    config,
    adapter: stores.adapter,
    engine: testEngine(),
    auth: user,
    siteSettingsAdapter: stores.settings,
    secrets: fakeVault,
    seoConfigAdapter: stores.seo,
    lockAdapter: stores.locks,
    persistenceType: 'sqlite',
  }
}

/** The API over the stores, as the server builds it */
export function testApi(stores: TestStores, config: ApiContext['config'] = testConfig()) {
  return createApiHandlers({
    contentConfig,
    config,
    adapter: stores.adapter,
    engine: testEngine(),
    siteSettingsAdapter: stores.settings,
    secrets: fakeVault,
    seoConfigAdapter: stores.seo,
    lockAdapter: stores.locks,
    persistenceType: 'sqlite',
  })
}

/** A request as a signed-in user (Bearer access token), JSON by default */
export function asUser(
  user: AuthenticatedUser | undefined,
  method: string,
  path: string,
  body?: unknown,
  contentType = 'application/json',
): ApiRequest {
  const headers: Record<string, string> = { 'content-type': contentType }
  if (user) {
    const { id, email, name, roles } = user
    headers.authorization = `Bearer ${signJwt({ sub: id, email, name, roles }, JWT_SECRET)}`
  }
  return { method, path, params: {}, query: {}, body, headers }
}
