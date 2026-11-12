import { defineCollection } from '@krantho/schema'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createHandler } from '../src/index.js'

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

describe('createHandler', () => {
  const handler = createHandler({
    config: {
      site,
      persistence: { provider: 'filesystem', filesystem: { contentPath: '/tmp/krantho-test' } },
    },
    collections: { pages },
  })

  it('returns a handler with handle method', () => {
    expect(handler.handle).toBeTypeOf('function')
  })

  it('handle method accepts Request and returns Response', async () => {
    const request = new Request('http://localhost:3000/api/collections')
    const response = await handler.handle(request)
    expect(response).toBeInstanceOf(Response)
    expect(response.status).toBe(200)
  })

  it('reports Node as the framework hosting the API', async () => {
    const response = await handler.handle(new Request('http://localhost:3000/api/capabilities'))
    expect(((await response.json()) as { framework: unknown }).framework).toBe('node')
  })
})
