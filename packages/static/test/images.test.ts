import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { KranthoConfigInput } from '@krantho/config'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { copyWidths, imageLookup, prepareImages, STATIC_IMAGE_WIDTHS } from '../src/images.js'

let publicDir: string

const site: KranthoConfigInput = {
  site: {
    domain: 'example.github.io',
    name: 'Docs',
    language: 'en',
    baseUrl: 'https://example.github.io/site',
  },
}

async function png(path: string, width: number, height: number): Promise<void> {
  const file = join(publicDir, path)
  mkdirSync(join(file, '..'), { recursive: true })
  const bytes = await sharp({
    create: { width, height, channels: 3, background: { r: 40, g: 120, b: 200 } },
  })
    .png()
    .toBuffer()
  writeFileSync(file, bytes)
}

beforeEach(() => {
  publicDir = mkdtempSync(join(tmpdir(), 'krantho-images-'))
})

afterEach(() => {
  rmSync(publicDir, { recursive: true, force: true })
})

describe('copyWidths', () => {
  it('uses the widths narrower than the image, and its own width', () => {
    expect(copyWidths(900)).toEqual([320, 480, 640, 750, 828, 900])
  })

  it('caps the own width at the widest of the list', () => {
    expect(copyWidths(4000)).toEqual(STATIC_IMAGE_WIDTHS)
  })

  it('copies an image narrower than every width at its own width', () => {
    expect(copyWidths(200)).toEqual([200])
  })

  it('takes a list of its own', () => {
    expect(copyWidths(1000, [400, 800])).toEqual([400, 800])
  })
})

describe('prepareImages', () => {
  it('writes AVIF and WebP copies at each width, and a manifest the lookup reads', async () => {
    await png('images/diagram.png', 900, 450)

    const result = await prepareImages({ config: site, publicDir })

    expect(result).toEqual({ images: 1, written: 12 })
    for (const width of [320, 480, 640, 750, 828, 900]) {
      for (const ext of ['avif', 'webp']) {
        expect(existsSync(join(publicDir, `_krantho/images/images/diagram-${width}.${ext}`))).toBe(
          true,
        )
      }
    }
    const webp = await sharp(join(publicDir, '_krantho/images/images/diagram-640.webp')).metadata()
    expect([webp.format, webp.width, webp.height]).toEqual(['webp', 640, 320])

    const lookup = imageLookup({ publicDir, basePath: '/site', sizes: '736px' })
    const image = lookup?.('/site/images/diagram.png')
    expect(image).toMatchObject({ width: 900, height: 450, sizes: '736px' })
    expect(image?.sources.map((source) => source.type)).toEqual(['image/avif', 'image/webp'])
    expect(image?.sources[0]?.srcset).toBe(
      [320, 480, 640, 750, 828, 900]
        .map((width) => `/site/_krantho/images/images/diagram-${width}.avif ${width}w`)
        .join(', '),
    )
    expect(lookup?.('/site/images/missing.png')).toBeUndefined()
    expect(lookup?.('https://example.com/images/diagram.png')).toBeUndefined()
  })

  it('keeps the copies of an unchanged image, and remakes them when the quality changes', async () => {
    await png('a.png', 500, 500)
    await prepareImages({ config: site, publicDir })
    const copy = join(publicDir, '_krantho/images/a-480.avif')
    const before = statSync(copy).mtimeMs

    expect(await prepareImages({ config: site, publicDir })).toEqual({ images: 1, written: 0 })
    expect(statSync(copy).mtimeMs).toBe(before)

    const changed: KranthoConfigInput = { ...site, media: { image: { quality: { avif: 40 } } } }
    expect((await prepareImages({ config: changed, publicDir })).written).toBe(6)
  })

  it('decides by content: a touched image keeps its copies, an edited one gets new ones', async () => {
    await png('a.png', 500, 500)
    await prepareImages({ config: site, publicDir })
    // A fresh checkout gives every file a new modification time
    const later = new Date(Date.now() + 60_000)
    utimesSync(join(publicDir, 'a.png'), later, later)

    expect((await prepareImages({ config: site, publicDir })).written).toBe(0)

    await png('a.png', 400, 200)
    expect(await prepareImages({ config: site, publicDir })).toEqual({ images: 1, written: 4 })
    expect(existsSync(join(publicDir, '_krantho/images/a-500.avif'))).toBe(false)
  })

  it('makes only the copies that are missing', async () => {
    await png('a.png', 500, 500)
    await prepareImages({ config: site, publicDir })
    rmSync(join(publicDir, '_krantho/images/a-320.webp'))

    expect((await prepareImages({ config: site, publicDir })).written).toBe(1)
  })

  it('copies at the widths a site gives, and refuses widths that are not positive whole numbers', async () => {
    await png('a.png', 1000, 500)

    expect(await prepareImages({ config: site, publicDir, widths: [400, 800] })).toEqual({
      images: 1,
      written: 4,
    })
    await expect(prepareImages({ config: site, publicDir, widths: [0] })).rejects.toThrow(
      'widths must be positive whole numbers',
    )
    await expect(prepareImages({ config: site, publicDir, widths: [] })).rejects.toThrow()
  })

  it('removes the copies of an image that is gone', async () => {
    await png('a.png', 100, 100)
    await prepareImages({ config: site, publicDir })
    rmSync(join(publicDir, 'a.png'))

    await prepareImages({ config: site, publicDir })

    expect(existsSync(join(publicDir, '_krantho/images/a-100.avif'))).toBe(false)
    const manifest = JSON.parse(
      readFileSync(join(publicDir, '_krantho/images/manifest.json'), 'utf8'),
    )
    expect(manifest.images).toEqual({})
  })

  it('leaves SVG and GIF files as they are', async () => {
    writeFileSync(join(publicDir, 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')

    expect(await prepareImages({ config: site, publicDir })).toEqual({ images: 0, written: 0 })
    expect(imageLookup({ publicDir, basePath: '' })?.('/logo.svg')).toBeUndefined()
  })

  it('writes an empty manifest for a site without images, so the folder a CI cache saves exists', async () => {
    expect(await prepareImages({ config: site, publicDir })).toEqual({ images: 0, written: 0 })

    const manifest = JSON.parse(
      readFileSync(join(publicDir, '_krantho/images/manifest.json'), 'utf8'),
    )
    expect(manifest.images).toEqual({})
  })

  it('remakes the copies over a manifest it cannot read', async () => {
    await png('a.png', 100, 100)
    mkdirSync(join(publicDir, '_krantho/images'), { recursive: true })
    writeFileSync(join(publicDir, '_krantho/images/manifest.json'), '{"stamp":"x"}')

    expect(imageLookup({ publicDir, basePath: '' })).toBeUndefined()
    expect(await prepareImages({ config: site, publicDir })).toEqual({ images: 1, written: 2 })
    expect(imageLookup({ publicDir, basePath: '' })?.('/a.png')).toBeDefined()
  })

  it('gives no lookup over a manifest that is not JSON, and rewrites it', async () => {
    await png('a.png', 100, 100)
    mkdirSync(join(publicDir, '_krantho/images'), { recursive: true })
    writeFileSync(join(publicDir, '_krantho/images/manifest.json'), '{ not json')

    expect(imageLookup({ publicDir, basePath: '' })).toBeUndefined()
    await prepareImages({ config: site, publicDir })
    expect(imageLookup({ publicDir, basePath: '' })?.('/a.png')).toBeDefined()
  })

  it('finds an image by a src with a query, and none for a src it cannot decode', async () => {
    await png('a b.png', 100, 100)
    await prepareImages({ config: site, publicDir })
    const lookup = imageLookup({ publicDir, basePath: '' })

    expect(lookup?.('/a%20b.png?v=2')?.sources[0]?.srcset).toBe(
      '/_krantho/images/a%20b-100.avif 100w',
    )
    expect(lookup?.('/a%E0%A4%A.png')).toBeUndefined()
    expect(lookup?.('//cdn.example.com/a b.png')).toBeUndefined()
  })

  it('sizes a photo by how its EXIF orientation shows it', async () => {
    const photo = await sharp({
      create: { width: 900, height: 400, channels: 3, background: { r: 200, g: 80, b: 40 } },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer()
    writeFileSync(join(publicDir, 'photo.jpg'), photo)

    await prepareImages({ config: site, publicDir })

    expect(imageLookup({ publicDir, basePath: '' })?.('/photo.jpg')).toMatchObject({
      width: 400,
      height: 900,
    })
    const copy = await sharp(join(publicDir, '_krantho/images/photo-320.webp')).metadata()
    expect([copy.width, copy.height]).toEqual([320, 720])
  })

  it('serves an image it cannot read as it is, and goes on with the others', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    writeFileSync(join(publicDir, 'broken.png'), 'not a png')
    await png('a.png', 100, 100)

    expect(await prepareImages({ config: site, publicDir })).toEqual({ images: 2, written: 2 })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('/broken.png is served as it is'))
    const lookup = imageLookup({ publicDir, basePath: '' })
    expect(lookup?.('/broken.png')).toBeUndefined()
    expect(lookup?.('/a.png')).toBeDefined()
    warn.mockRestore()
  })

  it('names what it wrote, for one image and for several', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await png('a.png', 100, 100)
    await prepareImages({ config: site, publicDir })
    await png('b.png', 100, 100)
    await png('c.png', 100, 100)
    await prepareImages({ config: site, publicDir })

    expect(log.mock.calls.map((call) => call[0])).toEqual([
      '[krantho] 2 copies of 1 image written to public/_krantho/images',
      '[krantho] 4 copies of 3 images written to public/_krantho/images',
    ])
    log.mockRestore()
  })

  it('reads no manifest whose entries are not image entries', async () => {
    mkdirSync(join(publicDir, '_krantho/images'), { recursive: true })
    const manifest = join(publicDir, '_krantho/images/manifest.json')
    for (const body of [
      'null',
      '{"stamp":"x","images":null}',
      '{"stamp":"x","images":{"/a.png":5}}',
    ]) {
      writeFileSync(manifest, body)
      expect(imageLookup({ publicDir, basePath: '' })).toBeUndefined()
    }
  })

  it('does nothing for a site without a public folder', async () => {
    const missing = join(publicDir, 'none')

    expect(await prepareImages({ config: site, publicDir: missing })).toEqual({
      images: 0,
      written: 0,
    })
    expect(existsSync(missing)).toBe(false)
  })

  it('gives no lookup before images are prepared', () => {
    expect(imageLookup({ publicDir, basePath: '' })).toBeUndefined()
  })
})
