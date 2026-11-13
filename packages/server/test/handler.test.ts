import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineCollection } from '@krantho/schema'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { KranthoHandlerOptions } from '../src/handler.js'
import { createKranthoHandler } from '../src/handler.js'

// Content lives in a temp directory: a write never reaches the checkout
const contentRoot = mkdtempSync(join(tmpdir(), 'krantho-handler-'))
const pagesDirectory = join(contentRoot, 'pages')

const pages = defineCollection({
  name: 'pages',
  source: 'filesystem',
  directory: pagesDirectory,
  schema: z.object({
    title: z.string(),
  }),
})

const site = {
  domain: 'test.example.com',
  name: 'Test Site',
  language: 'en',
  baseUrl: 'https://test.example.com',
}

const options: KranthoHandlerOptions = {
  config: {
    site,
    persistence: {
      provider: 'filesystem',
      filesystem: { contentPath: contentRoot },
    },
  },
  collections: { pages },
}

describe('createKranthoHandler', () => {
  let handler: Awaited<ReturnType<typeof createKranthoHandler>>

  it('creates a handler with handle method', async () => {
    handler = await createKranthoHandler(options)
    expect(handler.handle).toBeTypeOf('function')
  })

  it('handles GET /api/collections and returns JSON response', async () => {
    const request = new Request('http://localhost:3000/api/collections')
    const response = await handler.handle(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/json')

    const body = (await response.json()) as { collections: Array<{ name: string }> }
    expect(body.collections).toHaveLength(1)
    expect(body.collections[0]?.name).toBe('pages')
  })

  it('handles GET /api/schema/:collection and returns JSON Schema', async () => {
    const request = new Request('http://localhost:3000/api/schema/pages')
    const response = await handler.handle(request)

    expect(response.status).toBe(200)
    const body = (await response.json()) as { name: string; schema: Record<string, unknown> }
    expect(body.name).toBe('pages')
    expect(body.schema.type).toBe('object')
  })

  it('returns 404 for unknown collection', async () => {
    const request = new Request('http://localhost:3000/api/content/nonexistent')
    const response = await handler.handle(request)

    expect(response.status).toBe(404)
  })

  it('returns 404 for unknown route', async () => {
    const request = new Request('http://localhost:3000/api/unknown-route')
    const response = await handler.handle(request)

    expect(response.status).toBe(404)
  })

  it('registers no media routes when media.provider is unset', async () => {
    const response = await handler.handle(new Request('http://localhost:3000/api/media'))

    expect(response.status).toBe(404)
  })

  it('creates a document from a POST in its collection directory', async () => {
    const request = new Request('http://localhost:3000/api/content/pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: 'test-page',
        fields: { title: 'Test Page' },
        status: 'draft',
        body: '# Test',
      }),
    })
    const response = await handler.handle(request)

    expect(response.status).toBe(201)
    expect(existsSync(join(pagesDirectory, 'test-page.md'))).toBe(true)
  })
})

describe('the hosting framework', () => {
  async function reportedFramework(extra: Partial<KranthoHandlerOptions>): Promise<unknown> {
    const handler = await createKranthoHandler({ ...options, ...extra })
    const response = await handler.handle(new Request('http://localhost:3000/api/capabilities'))
    handler.close()
    return ((await response.json()) as { framework: unknown }).framework
  }

  it('reports the server package that created the handler', async () => {
    expect(await reportedFramework({ framework: 'sveltekit' })).toBe('sveltekit')
  })

  it('reports none for a handler created without one', async () => {
    expect(await reportedFramework({})).toBeNull()
  })
})

// Separate describe — creates its own handler instance

describe('persistence config', () => {
  it('works with explicit SQLite :memory: persistence', async () => {
    const handler = await createKranthoHandler({
      config: { site, persistence: { provider: 'sqlite', sqlite: { path: ':memory:' } } },
      collections: { pages },
    })

    const request = new Request('http://localhost:3000/api/collections')
    const response = await handler.handle(request)
    expect(response.status).toBe(200)
  })
})
