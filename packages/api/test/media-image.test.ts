import { resolveConfig } from '@krantho/config'
import type { ContentResult, IContentEngine } from '@krantho/core'
import type { IMediaFolderStorage, IPersistenceAdapter, MediaItem } from '@krantho/persistence'
import { defineCollection, defineConfig } from '@krantho/schema'
import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { type ApiHandlers, createApiHandlers } from '../src/create-api-handlers.js'
import type { ApiRequest, ApiResponse } from '../src/types.js'
import { MemoryFileStore, MemoryMediaMetadata } from './media-fakes.js'

const config = resolveConfig({
  site: {
    domain: 'test.example.com',
    name: 'Test Site',
    language: 'en',
    baseUrl: 'https://test.example.com',
  },
})

const pages = defineCollection({
  name: 'pages',
  source: 'database',
  schema: z.object({ title: z.string() }),
})

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'

let api: ApiHandlers
let files: MemoryFileStore

function engine(): IContentEngine {
  return {
    loadContent: vi.fn(async (): Promise<ContentResult> => {
      throw new Error('not used')
    }),
    getConfig: vi.fn(),
    clearCache: vi.fn(),
    getCacheStats: vi.fn(),
  } as unknown as IContentEngine
}

beforeEach(() => {
  files = new MemoryFileStore()
  api = createApiHandlers({
    contentConfig: defineConfig({ collections: { pages } }),
    config,
    adapter: {} as IPersistenceAdapter,
    engine: engine(),
    media: { metadata: new MemoryMediaMetadata(), folders: {} as IMediaFolderStorage, files },
  })
})

function request(
  method: string,
  path: string,
  query: Record<string, string> = {},
  extra: Partial<ApiRequest> = {},
): Promise<ApiResponse> {
  return api.handle({ method, path, params: {}, query, ...extra })
}

async function upload(bytes: Uint8Array, filename: string, mimeType: string): Promise<MediaItem> {
  const res = await request(
    'POST',
    '/api/media/upload',
    {},
    {
      files: [{ name: 'file', data: bytes, filename, mimeType }],
    },
  )
  expect(res.status).toBe(201)
  return res.body as MediaItem
}

async function uploadPng(): Promise<MediaItem> {
  const png = await sharp({
    create: { width: 400, height: 300, channels: 3, background: { r: 10, g: 120, b: 200 } },
  })
    .png()
    .toBuffer()
  return upload(new Uint8Array(png), 'photo.png', 'image/png')
}

/** The query of a redirect's Location */
function locationOf(res: ApiResponse): URLSearchParams {
  const location = res.headers?.['location'] ?? ''
  return new URL(location, 'https://site.test').searchParams
}

async function follow(
  res: ApiResponse,
  headers: Record<string, string> = {},
): Promise<ApiResponse> {
  const url = new URL(res.headers?.['location'] ?? '', 'https://site.test')
  return request('GET', url.pathname, Object.fromEntries(url.searchParams), { headers })
}

describe('GET /api/media/:id/image — stable URL', () => {
  it('should redirect uncached to the versioned URL', async () => {
    const item = await uploadPng()
    const res = await request('GET', `/api/media/${item.id}/image`, { preset: 'lg' })

    expect(res.status).toBe(302)
    expect(res.headers?.['cache-control']).toBe('no-cache')
    expect(res.headers?.['vary']).toBe('Accept')
    const query = locationOf(res)
    expect(query.get('preset')).toBe('lg')
    expect(query.get('fmt')).toBe('avif')
    expect(query.get('rev')).toMatch(/^[0-9a-f]{12}$/)
    expect(res.headers?.['location']).toMatch(new RegExp(`^/api/media/${item.id}/image\\?`))
  })

  it('should negotiate the format from Accept and map w to a preset', async () => {
    const item = await uploadPng()
    const res = await request(
      'GET',
      `/api/media/${item.id}/image`,
      { w: '300' },
      {
        headers: { accept: 'image/webp,*/*' },
      },
    )

    const query = locationOf(res)
    expect(query.get('fmt')).toBe('webp')
    expect(query.get('preset')).toBe('md')
  })

  it('should keep a valid aspect and drop an invalid one', async () => {
    const item = await uploadPng()
    const kept = await request('GET', `/api/media/${item.id}/image`, { aspect: '16:9' })
    const dropped = await request('GET', `/api/media/${item.id}/image`, { aspect: 'wide' })

    expect(locationOf(kept).get('aspect')).toBe('16:9')
    expect(locationOf(dropped).has('aspect')).toBe(false)
  })

  it('should answer 404 for an unknown item', async () => {
    const res = await request('GET', '/api/media/missing/image')
    expect(res.status).toBe(404)
  })
})

describe('GET /api/media/:id/image — versioned URL', () => {
  it('should serve immutable bytes with an ETag and no Vary', async () => {
    const item = await uploadPng()
    const res = await follow(await request('GET', `/api/media/${item.id}/image`, { fmt: 'png' }))

    expect(res.status).toBe(200)
    expect(res.headers?.['content-type']).toBe('image/png')
    expect(res.headers?.['cache-control']).toBe(
      'public, max-age=31536000, s-maxage=31536000, immutable',
    )
    expect(res.headers?.['etag']).toMatch(/^"[0-9a-f]+"$/)
    expect(res.headers?.['vary']).toBeUndefined()
    expect(res.body).toBeInstanceOf(Uint8Array)
  })

  it('should answer 304 on a matching If-None-Match', async () => {
    const item = await uploadPng()
    const redirect = await request('GET', `/api/media/${item.id}/image`, { fmt: 'webp' })
    const first = await follow(redirect)
    const again = await follow(redirect, { 'if-none-match': first.headers?.['etag'] ?? '' })

    expect(again.status).toBe(304)
    expect(again.body).toBeNull()
  })

  it('should redirect a stale rev to the current URL', async () => {
    const item = await uploadPng()
    const res = await request('GET', `/api/media/${item.id}/image`, {
      preset: 'sm',
      fmt: 'webp',
      rev: '000000000000',
    })

    expect(res.status).toBe(302)
    expect(res.headers?.['cache-control']).toBe('no-cache')
    expect(locationOf(res).get('rev')).not.toBe('000000000000')
    expect(locationOf(res).get('preset')).toBe('sm')
  })

  it('should redirect a versioned URL without fmt', async () => {
    const item = await uploadPng()
    const rev = locationOf(await request('GET', `/api/media/${item.id}/image`)).get('rev') ?? ''
    const res = await request('GET', `/api/media/${item.id}/image`, { rev })

    expect(res.status).toBe(302)
    expect(locationOf(res).get('fmt')).toBe('avif')
  })

  it('should answer HEAD with headers and no body', async () => {
    const item = await uploadPng()
    const redirect = await request('GET', `/api/media/${item.id}/image`, { fmt: 'jpeg' })
    const url = new URL(redirect.headers?.['location'] ?? '', 'https://site.test')
    const res = await request('HEAD', url.pathname, Object.fromEntries(url.searchParams))

    expect(res.status).toBe(200)
    expect(res.body).toBeNull()
    expect(Number(res.headers?.['content-length'])).toBeGreaterThan(0)
  })

  it('should answer 404 when the original file is gone', async () => {
    const item = await uploadPng()
    files.objects.clear()
    const res = await follow(await request('GET', `/api/media/${item.id}/image`))

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Original file not found' })
  })
})

describe('image revision', () => {
  async function revOf(id: string): Promise<string | null> {
    return locationOf(await request('GET', `/api/media/${id}/image`)).get('rev')
  }

  it('should change on a crop update', async () => {
    const item = await uploadPng()
    const before = await revOf(item.id)
    const res = await request(
      'PUT',
      `/api/media/${item.id}`,
      {},
      {
        body: { crop: { x: 0, y: 0, width: 50, height: 50 } },
      },
    )

    expect(res.status).toBe(200)
    expect(await revOf(item.id)).not.toBe(before)
  })

  it('should stay the same on an alt-text update', async () => {
    const item = await uploadPng()
    const before = await revOf(item.id)
    await request('PUT', `/api/media/${item.id}`, {}, { body: { altText: 'A photo' } })

    expect(await revOf(item.id)).toBe(before)
  })

  it('should change on replace', async () => {
    const item = await uploadPng()
    const before = await revOf(item.id)
    const png = await sharp({
      create: { width: 20, height: 20, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer()
    const res = await request(
      'POST',
      `/api/media/${item.id}/replace`,
      {},
      {
        files: [
          { name: 'file', data: new Uint8Array(png), filename: 'b.png', mimeType: 'image/png' },
        ],
      },
    )

    expect(res.status).toBe(200)
    expect(await revOf(item.id)).not.toBe(before)
  })
})

describe('SVG', () => {
  it('should resolve to fmt=original and serve the SVG bytes', async () => {
    const item = await upload(new TextEncoder().encode(SVG), 'logo.svg', 'image/svg+xml')
    const redirect = await request(
      'GET',
      `/api/media/${item.id}/image`,
      {},
      {
        headers: { accept: 'image/avif' },
      },
    )
    expect(locationOf(redirect).get('fmt')).toBe('original')

    const res = await follow(redirect)
    expect(res.status).toBe(200)
    expect(res.headers?.['content-type']).toBe('image/svg+xml')
    expect(new TextDecoder().decode(res.body as Uint8Array)).toBe(SVG)
  })

  it('should rasterize an SVG when a format is explicit', async () => {
    const item = await upload(new TextEncoder().encode(SVG), 'logo.svg', 'image/svg+xml')
    const redirect = await request('GET', `/api/media/${item.id}/image`, { fmt: 'png' })
    expect(locationOf(redirect).get('fmt')).toBe('png')

    const res = await follow(redirect)
    expect(res.headers?.['content-type']).toBe('image/png')
  })
})

describe('GET /api/media/:id/image/info', () => {
  it('should find the variant under the revisioned cache key', async () => {
    const item = await uploadPng()
    const redirect = await request('GET', `/api/media/${item.id}/image`, {
      fmt: 'webp',
      preset: 'sm',
    })
    const served = await follow(redirect)

    const info = await request('GET', `/api/media/${item.id}/image/info`, {
      fmt: 'webp',
      preset: 'sm',
    })
    expect(info.status).toBe(200)
    expect(info.body).toMatchObject({
      preset: 'sm',
      format: 'webp',
      etag: (served.headers?.['etag'] ?? '').replaceAll('"', ''),
    })
  })

  it('should miss after a crop changes the revision', async () => {
    const item = await uploadPng()
    await follow(await request('GET', `/api/media/${item.id}/image`, { fmt: 'webp' }))
    await request(
      'PUT',
      `/api/media/${item.id}`,
      {},
      {
        body: { crop: { x: 0, y: 0, width: 50, height: 50 } },
      },
    )

    const info = await request('GET', `/api/media/${item.id}/image/info`, { fmt: 'webp' })
    expect(info.status).toBe(404)
  })
})
