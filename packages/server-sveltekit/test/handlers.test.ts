import { defineCollection } from '@krantho/schema'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createApiHandlers } from '../src/index.js'

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

/** Mock SvelteKit RequestEvent */
function mockEvent(request: Request): { request: Request } {
  return { request }
}

describe('createApiHandlers (SvelteKit)', () => {
  const handlers = createApiHandlers({
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

  it('extracts request from SvelteKit event object', async () => {
    const event = mockEvent(new Request('http://localhost:5173/api/collections'))
    const response = await handlers.GET(event)
    expect(response.status).toBe(200)
    const body = (await response.json()) as { collections: Array<{ name: string }> }
    expect(body.collections).toHaveLength(1)
  })

  it('reports SvelteKit as the framework hosting the API', async () => {
    const event = mockEvent(new Request('http://localhost:5173/api/capabilities'))
    const body = (await (await handlers.GET(event)).json()) as { framework: unknown }
    expect(body.framework).toBe('sveltekit')
  })
})
