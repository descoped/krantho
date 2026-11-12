import { defineCollection } from '@krantho/schema'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createApiRouteHandlers } from '../src/index.js'

const pages = defineCollection({
  name: 'pages',
  source: 'filesystem',
  directory: 'content/pages',
  schema: z.object({
    title: z.string(),
  }),
})

const site = {
  domain: 'test.example.com',
  name: 'Test',
  language: 'en',
  baseUrl: 'https://test.example.com',
}

describe('createApiRouteHandlers', () => {
  const handlers = createApiRouteHandlers({
    config: {
      site,
      persistence: { provider: 'filesystem', filesystem: { contentPath: '/tmp/krantho-test' } },
    },
    collections: { pages },
  })

  it('exports GET, POST, PUT, DELETE, PATCH handlers', () => {
    expect(handlers.GET).toBeTypeOf('function')
    expect(handlers.POST).toBeTypeOf('function')
    expect(handlers.PUT).toBeTypeOf('function')
    expect(handlers.DELETE).toBeTypeOf('function')
    expect(handlers.PATCH).toBeTypeOf('function')
  })

  it('reuses handler across concurrent requests (singleton)', async () => {
    const r1 = new Request('http://localhost:3000/api/collections')
    const r2 = new Request('http://localhost:3000/api/collections')

    const context = { params: Promise.resolve({ path: ['collections'] }) }

    const [res1, res2] = await Promise.all([handlers.GET(r1, context), handlers.GET(r2, context)])
    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
  })

  it('reports Next.js as the framework hosting the API', async () => {
    const context = { params: Promise.resolve({ path: ['capabilities'] }) }
    const response = await handlers.GET(
      new Request('http://localhost:3000/api/capabilities'),
      context,
    )
    expect(((await response.json()) as { framework: unknown }).framework).toBe('next')
  })
})

describe('createApiRouteHandlers with a rewritten URL', () => {
  const handlers = createApiRouteHandlers({
    config: {
      site,
      persistence: { provider: 'filesystem', filesystem: { contentPath: '/tmp/krantho-test' } },
    },
    collections: { pages },
  })

  it('routes by the catch-all segments the request was rewritten to', async () => {
    const request = new Request('http://localhost:3000/robots.txt')
    const params = Promise.resolve({ path: ['seo', 'robots.txt'] })
    const response = await handlers.GET(request, { params })
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('User-agent')
  })
})
