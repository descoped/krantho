import { describe, expect, it } from 'vitest'
import { mediaInfo } from '../src/handlers/media-info.js'
import { mediaUsageBatch } from '../src/handlers/media-usage.js'
import { MediaLibrary } from '../src/media-library.js'
import type { ApiContext, ApiRequest } from '../src/types.js'
import { editor } from './assistant/auth.js'
import { testContext, testStores } from './assistant/fixtures.js'
import { MemoryFileStore, MemoryMediaMetadata } from './media-fakes.js'

async function context(): Promise<ApiContext> {
  const ctx = testContext(editor, testStores())
  const metadata = new MemoryMediaMetadata()
  const library = new MediaLibrary(metadata, new MemoryFileStore(), {
    maxFileSize: 1024,
    allowedMimeTypes: ['image/png'],
  })
  for (const [id, folder, size] of [
    ['hero', 'f1', 100],
    ['logo', 'f1', 50],
    ['plan', null, 10],
  ] as const) {
    await metadata.insert({
      id,
      filename: `${id}.png`,
      storageKey: `${id}.png`,
      url: `/uploads/${id}.png`,
      altText: '',
      mimeType: 'image/png',
      size,
      width: null,
      height: null,
      folder,
      tags: [],
      crop: null,
      hotspot: null,
    })
  }
  const writer = ctx.adapter.writeContent?.bind(ctx.adapter)
  await writer?.({
    collection: 'pages',
    slug: 'about',
    locale: 'en',
    fields: { title: 'About', hero: '/api/media/hero/image' },
    body: '![Logo](/api/media/logo/image)',
  })
  return { ...ctx, mediaStorage: library }
}

function get(path: string, query: Record<string, string>): ApiRequest {
  return { method: 'GET', path, params: {}, query }
}

describe('GET /api/media/usage?ids=', () => {
  it('answers where each file is used, fields and body, from one read of the content', async () => {
    const res = await mediaUsageBatch(
      get('/api/media/usage', { ids: 'hero,logo,plan' }),
      await context(),
    )
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      usage: {
        hero: [{ collection: 'pages', slug: 'about', field: 'hero' }],
        logo: [{ collection: 'pages', slug: 'about', field: 'body' }],
        plan: [],
      },
    })
  })

  it('fails rather than answer no references when a collection cannot be listed', async () => {
    const ctx = await context()
    const failing = {
      ...ctx,
      adapter: {
        ...ctx.adapter,
        query: async () => {
          throw new Error('listing failed')
        },
      },
    }
    await expect(
      mediaUsageBatch(get('/api/media/usage', { ids: 'hero' }), failing),
    ).rejects.toThrow('listing failed')
  })

  it('refuses a request that names no file, or too many', async () => {
    const ctx = await context()
    expect((await mediaUsageBatch(get('/api/media/usage', {}), ctx)).status).toBe(400)
    const many = Array.from({ length: 201 }, (_, i) => `m${i}`).join(',')
    expect((await mediaUsageBatch(get('/api/media/usage', { ids: many }), ctx)).status).toBe(400)
  })
})

describe('GET /api/media/info', () => {
  it('answers the exact file count, total size and each folder’s count', async () => {
    const res = await mediaInfo(get('/api/media/info', {}), await context())
    expect(res.body).toMatchObject({ totalItems: 3, totalSize: 160, folderCounts: { f1: 2 } })
  })
})
