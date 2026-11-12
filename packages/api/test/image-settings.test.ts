import type { DeepPartial, MediaSection } from '@krantho/config'
import { resolveConfig } from '@krantho/config'
import sharp from 'sharp'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImageCache } from '../src/image-cache.js'
import { ImageOptimizer } from '../src/image-optimizer.js'

const site = {
  domain: 'test.example.com',
  name: 'Test Site',
  language: 'en',
  baseUrl: 'https://test.example.com',
}

function imageConfig(overrides: DeepPartial<MediaSection['image']> = {}): MediaSection['image'] {
  return resolveConfig({ site, media: { image: overrides } }).media.image
}

/** A source wide enough to exercise both the preset widths and the upload cap */
async function sourceImage(): Promise<Buffer> {
  return sharp({
    create: { width: 600, height: 400, channels: 3, background: { r: 200, g: 60, b: 30 } },
  })
    .jpeg({ quality: 95 })
    .toBuffer()
}

const caches: ImageCache[] = []

function makeCache(overrides: DeepPartial<MediaSection['image']['cache']> = {}): ImageCache {
  const cache = new ImageCache(imageConfig({ cache: overrides }).cache)
  caches.push(cache)
  return cache
}

function variant(bytes: number): { bytes: Buffer; contentType: string; etag: string } {
  return { bytes: Buffer.alloc(bytes), contentType: 'image/webp', etag: 'x' }
}

afterEach(() => {
  for (const cache of caches.splice(0)) cache.dispose()
})

describe('image settings resolved from config', () => {
  it('ships the values the optimizer and cache used before they were configurable', () => {
    const image = imageConfig()

    expect(image.maxWidth).toBe(2048)
    expect(image.quality).toEqual({ jpeg: 82, webp: 80, avif: 65, normalize: 85 })
    expect(image.presets).toEqual({ xs: 48, sm: 96, md: 256, lg: 512, xl: 1024, full: null })
    expect(image.cache).toEqual({ maxEntries: 1000, maxMb: 256, ttiSec: 3600 })
  })

  it('produces byte-identical variants to the pre-config pipeline', async () => {
    const source = await sourceImage()
    const optimizer = new ImageOptimizer(imageConfig())

    const result = await optimizer.generateVariant(source, 'sm', 'jpeg')
    const expected = await sharp(source)
      .rotate()
      .resize({ width: 96, withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer()

    expect(Buffer.compare(result.bytes, expected)).toBe(0)
  })

  it('normalizes an upload at the configured cap and quality', async () => {
    const source = await sourceImage()
    const optimizer = new ImageOptimizer(imageConfig({ maxWidth: 120, quality: { normalize: 40 } }))

    const result = await optimizer.normalize(source, 'image/jpeg')
    const expected = await sharp(source)
      .rotate()
      .resize({ width: 120, withoutEnlargement: true })
      .jpeg({ quality: 40 })
      .toBuffer()

    expect(result.width).toBe(120)
    expect(Buffer.compare(result.buffer, expected)).toBe(0)
  })

  it('resizes to the configured preset width', async () => {
    const source = await sourceImage()
    const optimizer = new ImageOptimizer(imageConfig({ presets: { sm: 40 } }))

    const result = await optimizer.generateVariant(source, 'sm', 'webp')

    expect(result.width).toBe(40)
  })

  it('serves the full preset at the original size', async () => {
    const source = await sourceImage()
    const optimizer = new ImageOptimizer(imageConfig())

    const result = await optimizer.generateVariant(source, 'full', 'webp')

    expect(result.width).toBe(600)
  })

  it('encodes at the configured quality', async () => {
    const source = await sourceImage()
    const optimizer = new ImageOptimizer(imageConfig({ quality: { webp: 30, avif: 40 } }))

    const webpVariant = await optimizer.generateVariant(source, 'lg', 'webp')
    const expectedWebp = await sharp(source)
      .rotate()
      .resize({ width: 512, withoutEnlargement: true })
      .webp({ quality: 30 })
      .toBuffer()
    expect(Buffer.compare(webpVariant.bytes, expectedWebp)).toBe(0)

    const avifVariant = await optimizer.generateVariant(source, 'xs', 'avif')
    const expectedAvif = await sharp(source)
      .rotate()
      .resize({ width: 48, withoutEnlargement: true })
      .avif({ quality: 40 })
      .toBuffer()
    expect(Buffer.compare(avifVariant.bytes, expectedAvif)).toBe(0)
  })

  it('caps the cache at the configured entry count', () => {
    const cache = makeCache({ maxEntries: 2 })

    cache.set('a/sm/webp', variant(10))
    cache.set('b/sm/webp', variant(10))
    cache.set('c/sm/webp', variant(10))

    expect(cache.size).toBe(2)
    expect(cache.get('a/sm/webp')).toBeUndefined()
  })

  it('caps the cache at the configured memory budget', () => {
    const cache = makeCache({ maxMb: 1 })

    cache.set('a/lg/webp', variant(700 * 1024))
    cache.set('b/lg/webp', variant(700 * 1024))

    expect(cache.size).toBe(1)
    expect(cache.memoryBytes).toBeLessThanOrEqual(1024 * 1024)
  })

  it('expires an entry after the configured idle time', () => {
    vi.useFakeTimers()
    try {
      const cache = makeCache({ ttiSec: 1 })
      cache.set('a/sm/webp', variant(10))
      vi.advanceTimersByTime(1500)

      expect(cache.get('a/sm/webp')).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })
})
