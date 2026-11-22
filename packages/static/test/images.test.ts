import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type KranthoConfigInput, resolveConfig } from '@krantho/config'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { copyWidths, imageLookup, prepareImages } from '../src/images.js'

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
  const settings = resolveConfig(site).media.image

  it('uses the server presets narrower than the image, and the full width', () => {
    expect(copyWidths(700, settings)).toEqual([48, 96, 256, 512, 700])
  })

  it('caps the full width at media.image.maxWidth', () => {
    expect(copyWidths(4000, settings)).toEqual([48, 96, 256, 512, 1024, 2048])
  })

  it('copies an image narrower than every preset at its own width', () => {
    expect(copyWidths(40, settings)).toEqual([40])
  })
})

describe('prepareImages', () => {
  it('writes AVIF and WebP copies at each width, and a manifest the lookup reads', async () => {
    await png('images/diagram.png', 600, 300)

    const result = await prepareImages({ config: site, publicDir })

    expect(result).toEqual({ images: 1, written: 10 })
    for (const width of [48, 96, 256, 512, 600]) {
      for (const ext of ['avif', 'webp']) {
        expect(existsSync(join(publicDir, `_krantho/images/images/diagram-${width}.${ext}`))).toBe(
          true,
        )
      }
    }
    const webp = await sharp(join(publicDir, '_krantho/images/images/diagram-256.webp')).metadata()
    expect([webp.format, webp.width, webp.height]).toEqual(['webp', 256, 128])

    const lookup = imageLookup({ publicDir, basePath: '/site', sizes: '736px' })
    const image = lookup?.('/site/images/diagram.png')
    expect(image).toMatchObject({ width: 600, height: 300, sizes: '736px' })
    expect(image?.sources.map((source) => source.type)).toEqual(['image/avif', 'image/webp'])
    expect(image?.sources[0]?.srcset).toBe(
      '/site/_krantho/images/images/diagram-48.avif 48w, /site/_krantho/images/images/diagram-96.avif 96w, ' +
        '/site/_krantho/images/images/diagram-256.avif 256w, /site/_krantho/images/images/diagram-512.avif 512w, ' +
        '/site/_krantho/images/images/diagram-600.avif 600w',
    )
    expect(lookup?.('/site/images/missing.png')).toBeUndefined()
    expect(lookup?.('https://example.com/images/diagram.png')).toBeUndefined()
  })

  it('keeps copies that are up to date, and remakes them when the settings change', async () => {
    await png('a.png', 300, 300)
    await prepareImages({ config: site, publicDir })
    const copy = join(publicDir, '_krantho/images/a-256.avif')
    const before = statSync(copy).mtimeMs

    expect(await prepareImages({ config: site, publicDir })).toEqual({ images: 1, written: 0 })
    expect(statSync(copy).mtimeMs).toBe(before)

    const changed: KranthoConfigInput = { ...site, media: { image: { quality: { avif: 40 } } } }
    expect((await prepareImages({ config: changed, publicDir })).written).toBe(8)
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
    expect(existsSync(join(publicDir, '_krantho'))).toBe(false)
  })

  it('remakes the copies over a manifest it cannot read', async () => {
    await png('a.png', 100, 100)
    mkdirSync(join(publicDir, '_krantho/images'), { recursive: true })
    writeFileSync(join(publicDir, '_krantho/images/manifest.json'), '{"stamp":"x"}')

    expect(imageLookup({ publicDir, basePath: '' })).toBeUndefined()
    expect(await prepareImages({ config: site, publicDir })).toEqual({ images: 1, written: 6 })
    expect(imageLookup({ publicDir, basePath: '' })?.('/a.png')).toBeDefined()
  })

  it('gives no lookup before images are prepared', () => {
    expect(imageLookup({ publicDir, basePath: '' })).toBeUndefined()
  })
})
